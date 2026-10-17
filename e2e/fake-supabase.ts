import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';

// Must match .env.e2e: the e2e build sends every API call here, and the tests answer them.
export const API_ORIGIN = 'https://e2e-test.supabase.co';
export const HERE = { latitude: 3.8667, longitude: 11.5167 };

// Real Protomaps tiles of central Yaoundé (zooms 11-14), so the offline map code runs against a true archive.
const BASEMAP = readFileSync(new URL('./fixtures/yaounde.pmtiles', import.meta.url));
const BASEMAP_FILE = 'yaounde.pmtiles';
const MANIFEST = {
	version: 1,
	build: 'e2e',
	attribution: 'Protomaps © OpenStreetMap',
	overview: { file: BASEMAP_FILE, maxZoom: 10 },
	detail: { cellZoom: 8, minZoom: 11, maxZoom: 14, cells: { '136/125': { file: BASEMAP_FILE, bytes: BASEMAP.length } } }
};

type PointRow = {
	id: string;
	network_id: string;
	code: string;
	lat: number;
	lng: number;
	accuracy_m: number;
	withdrawal_count: number;
	last_withdrawal_at: string | null;
	status: 'active' | 'hidden';
	updated_at: string;
};

export type RecordedWithdrawal = Record<string, unknown>;

/** A withdrawal as the server keeps it for its user's history. */
export type HistoryRow = { client_uuid: string; amount: number; captured_at: string; point_id: string };

const PAST = '2026-10-01T08:00:00.000Z';

function base64url(value: object): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
	const rad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * rad;
	const dLng = (b.lng - a.lng) * rad;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
	return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** An in-memory Supabase answering exactly the requests Daily makes. */
export class FakeSupabase {
	user = { id: randomUUID(), email: 'ama@example.com', password: 'secret123' };
	points: PointRow[] = [
		{ id: randomUUID(), network_id: 'orange', code: '13579', lat: 3.8669, lng: 11.5169, accuracy_m: 10, withdrawal_count: 4, last_withdrawal_at: PAST, status: 'active', updated_at: PAST },
		{ id: randomUUID(), network_id: 'mtn', code: '24680', lat: 3.868, lng: 11.5175, accuracy_m: 12, withdrawal_count: 1, last_withdrawal_at: PAST, status: 'active', updated_at: PAST }
	];
	saved = new Map<string, string>();
	withdrawals: RecordedWithdrawal[] = [];
	/** The user's withdrawals on the server, e.g. made on another phone. */
	history: HistoryRow[] = [];
	/** When true, API calls fail as if the server could not be reached. */
	unreachable = false;
	/** When true, a basemap is published (manifest and tile archive); otherwise the map has no tiles. */
	basemap = false;
	tileRangeRequests = 0;
	/** Requests for the online fallback map (OpenFreeMap), answered locally. */
	fallbackStyleRequests = 0;
	profile: { onboarded_at: string | null; privacy_version: number | null } = { onboarded_at: null, privacy_version: null };
	unexpected: string[] = [];

	session(): Record<string, unknown> {
		const now = Math.floor(Date.now() / 1000);
		const claims = { sub: this.user.id, email: this.user.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 };
		return {
			access_token: `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}.e2e`,
			token_type: 'bearer',
			expires_in: 3600,
			expires_at: now + 3600,
			refresh_token: 'e2e-refresh-token',
			user: { id: this.user.id, aud: 'authenticated', role: 'authenticated', email: this.user.email, app_metadata: {}, user_metadata: {}, created_at: PAST }
		};
	}

	async install(page: Page): Promise<void> {
		await page.context().route(`${API_ORIGIN}/**`, (route) => this.#handle(route));
		// Stand-in for the OpenFreeMap fallback style, so the tests never depend on the internet.
		await page.context().route('https://tiles.openfreemap.org/**', (route) => {
			if (!new URL(route.request().url()).pathname.startsWith('/styles/')) return route.fulfill({ status: 404 });
			this.fallbackStyleRequests++;
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					version: 8,
					glyphs: 'http://localhost:4173/map/fonts/{fontstack}/{range}.pbf',
					sources: {},
					layers: [{ id: 'fallback-background', type: 'background', paint: { 'background-color': '#e8e4da' } }]
				})
			});
		});
	}

	/** Starts the app already signed in and onboarded, as a returning user would. */
	async signInBeforeLoad(page: Page): Promise<void> {
		await page.addInitScript(
			([session, userId]) => {
				localStorage.setItem('daily.auth', JSON.stringify(session));
				localStorage.setItem(`daily.onboarded.${userId}`, '1');
			},
			[this.session(), this.user.id] as const
		);
	}

	async #handle(route: Route): Promise<void> {
		const request = route.request();
		const url = new URL(request.url());
		const path = url.pathname;
		const body = request.postData() ? (request.postDataJSON() as Record<string, unknown>) : {};
		const json = (status: number, data: unknown) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

		if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
		if (this.unreachable) return route.abort('internetdisconnected');

		if (path === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
			const ok = body.email === this.user.email && body.password === this.user.password;
			return ok ? json(200, this.session()) : json(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
		}
		if (path === '/auth/v1/token') return json(200, this.session());
		if (path === '/auth/v1/signup') {
			this.user = { id: randomUUID(), email: String(body.email), password: String(body.password) };
			return json(200, this.session());
		}
		if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
		if (path === '/auth/v1/user') return json(200, this.session().user);

		if (path === '/rest/v1/networks') {
			return json(200, [
				{ id: 'mtn', name: 'MTN MoMo', color: '#FFCC00', code_pattern: '^[0-9]{4,6}$', min_amount: 500, max_amount: null, quick_amounts: [5000, 10000, 20000], sort_order: 1 },
				{ id: 'orange', name: 'Orange Money', color: '#FF7900', code_pattern: '^[0-9]{4,6}$', min_amount: 500, max_amount: null, quick_amounts: [5000, 10000, 20000], sort_order: 2 }
			]);
		}
		if (path === '/rest/v1/ussd_templates') {
			return json(200, [
				{ network_id: 'mtn', template: '*126*16*{code}*{amount}#' },
				{ network_id: 'orange', template: '#150*14*{code}*{amount}#' }
			]);
		}
		if (path === '/rest/v1/profiles' && request.method() === 'PATCH') {
			this.profile = { onboarded_at: String(body.onboarded_at), privacy_version: Number(body.privacy_version) };
			return route.fulfill({ status: 204 });
		}
		if (path === '/rest/v1/profiles') {
			const single = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
			return json(200, single ? this.profile : [this.profile]);
		}
		if (path === '/rest/v1/rpc/points_in_bbox') return json(200, this.#pointsInBbox(body));
		if (path === '/rest/v1/rpc/record_withdrawal') return json(200, this.#record(body));
		if (path === '/rest/v1/rpc/my_saved_points') {
			return json(
				200,
				[...this.saved].flatMap(([pointId, savedAt]) => {
					const point = this.points.find((p) => p.id === pointId);
					if (!point) return [];
					const { id, status, ...fields } = point;
					return status === 'active' ? [{ point_id: id, saved_at: savedAt, ...fields }] : [];
				})
			);
		}
		if (path === '/rest/v1/rpc/my_withdrawals') {
			return json(
				200,
				this.history
					.toSorted((a, b) => b.captured_at.localeCompare(a.captured_at))
					.flatMap((row) => {
						const point = this.points.find((p) => p.id === row.point_id);
						if (!point) return [];
						const { id, ...fields } = point;
						return [{ ...row, point_id: id, ...fields }];
					})
			);
		}
		if (path === '/rest/v1/saved_points' && request.method() === 'POST') {
			this.saved.set(String(body.point_id), new Date().toISOString());
			return route.fulfill({ status: 201 });
		}
		if (path === '/rest/v1/saved_points' && request.method() === 'DELETE') {
			this.saved.delete((url.searchParams.get('point_id') ?? '').replace('eq.', ''));
			return route.fulfill({ status: 204 });
		}
		if (path.startsWith('/storage/v1/object/public/tiles/')) {
			const object = path.slice('/storage/v1/object/public/tiles/'.length);
			if (this.basemap && object === 'manifest.json') return json(200, MANIFEST);
			if (this.basemap && object === `${MANIFEST.build}/${BASEMAP_FILE}`) return this.#serveRange(route);
			return json(404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
		}

		this.unexpected.push(`${request.method()} ${path}`);
		return json(404, { message: 'Not handled by the e2e fake' });
	}

	#serveRange(route: Route): Promise<void> {
		this.tileRangeRequests++;
		const match = /bytes=(\d+)-(\d+)/.exec(route.request().headers()['range'] ?? '');
		const start = match ? Number(match[1]) : 0;
		const end = Math.min(match ? Number(match[2]) : BASEMAP.length - 1, BASEMAP.length - 1);
		return route.fulfill({
			status: 206,
			contentType: 'application/octet-stream',
			headers: { 'content-range': `bytes ${start}-${end}/${BASEMAP.length}`, 'accept-ranges': 'bytes', etag: '"e2e"' },
			body: BASEMAP.subarray(start, end + 1)
		});
	}

	#pointsInBbox(body: Record<string, unknown>): PointRow[] {
		const [west, south, east, north] = ['p_west', 'p_south', 'p_east', 'p_north'].map((key) => Number(body[key]));
		const since = typeof body.p_since === 'string' ? body.p_since : null;
		return this.points
			.filter((p) => p.lng >= west && p.lng <= east && p.lat >= south && p.lat <= north)
			.filter((p) => since === null || p.updated_at > since)
			.sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id));
	}

	#record(body: Record<string, unknown>): { point_id: string; outcome: string } {
		this.withdrawals.push(body);
		const now = new Date().toISOString();
		const location = typeof body.p_lat === 'number' ? { lat: body.p_lat, lng: Number(body.p_lng) } : null;
		let point = this.points.find((p) => p.id === body.p_point_id);
		point ??= location
			? this.points.find((p) => p.network_id === body.p_network_id && p.code === body.p_code && distanceM(p, location) <= 300)
			: undefined;
		const remember = (pointId: string) =>
			this.history.push({
				client_uuid: String(body.p_client_uuid),
				amount: Number(body.p_amount),
				captured_at: typeof body.p_captured_at === 'string' ? body.p_captured_at : now,
				point_id: pointId
			});
		if (point) {
			point.withdrawal_count++;
			point.last_withdrawal_at = now;
			point.updated_at = now;
			remember(point.id);
			return { point_id: point.id, outcome: 'attached' };
		}
		const created: PointRow = {
			id: randomUUID(),
			network_id: String(body.p_network_id),
			code: String(body.p_code),
			lat: location?.lat ?? 0,
			lng: location?.lng ?? 0,
			accuracy_m: Number(body.p_accuracy_m ?? 50),
			withdrawal_count: 1,
			last_withdrawal_at: now,
			status: 'active',
			updated_at: now
		};
		this.points.push(created);
		remember(created.id);
		return { point_id: created.id, outcome: 'created' };
	}
}
