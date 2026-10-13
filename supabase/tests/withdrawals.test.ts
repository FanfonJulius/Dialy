import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	DOUALA,
	YAOUNDE,
	actAs,
	actAsAdmin,
	attempt,
	createTestDatabase,
	createUser,
	offsetMeters,
	type LatLng
} from './helpers/database.js';

type Result = { point_id: string; outcome: 'created' | 'attached' | 'duplicate' };

type WithdrawalInput = {
	network?: string;
	code?: string;
	amount?: number;
	at?: LatLng | null;
	accuracy?: number | null;
	minutesAgo?: number;
	capturedAt?: Date | null;
	pointId?: string | null;
	clientUuid?: string;
};

type PointRow = {
	id: string;
	network_id: string;
	code: string;
	withdrawal_count: number;
	accuracy_m: number;
	last_withdrawal_at: Date | null;
};

let db: PGlite;
let alice: string;
let bob: string;
let now: Date;

beforeAll(async () => {
	db = await createTestDatabase();
	alice = await createUser(db, 'alice@example.com');
	bob = await createUser(db, 'bob@example.com');
});

afterAll(async () => {
	await db.close();
});

beforeEach(async () => {
	await db.exec('begin');
	now = (await db.query<{ now: Date }>('select now() as now')).rows[0].now;
});

afterEach(async () => {
	await db.exec('rollback');
});

function minutesBeforeNow(minutes: number): Date {
	return new Date(now.getTime() - minutes * 60_000);
}

async function withdraw(userId: string, input: WithdrawalInput = {}) {
	await actAs(db, userId);
	const at = input.at === undefined ? DOUALA : input.at;
	const capturedAt =
		input.capturedAt !== undefined ? input.capturedAt : minutesBeforeNow(input.minutesAgo ?? 0);
	return attempt<Result>(
		db,
		`select * from public.record_withdrawal(
			p_client_uuid => $1, p_network_id => $2, p_code => $3, p_amount => $4,
			p_lat => $5, p_lng => $6, p_accuracy_m => $7, p_captured_at => $8, p_point_id => $9)`,
		[
			input.clientUuid ?? randomUUID(),
			input.network ?? 'mtn',
			input.code ?? '12345',
			input.amount ?? 5000,
			at?.lat ?? null,
			at?.lng ?? null,
			input.accuracy === undefined ? 20 : input.accuracy,
			capturedAt,
			input.pointId ?? null
		]
	);
}

async function withdrawOk(userId: string, input: WithdrawalInput = {}): Promise<Result> {
	const { rows, error } = await withdraw(userId, input);
	expect(error).toBeNull();
	return rows[0];
}

async function expectRejected(userId: string, input: WithdrawalInput, reason: string): Promise<void> {
	const { error } = await withdraw(userId, input);
	expect(error?.message).toBe(reason);
}

async function point(id: string): Promise<PointRow> {
	await actAsAdmin(db);
	const { rows } = await db.query<PointRow>(
		'select id, network_id, code, withdrawal_count, accuracy_m, last_withdrawal_at from public.points where id = $1',
		[id]
	);
	return rows[0];
}

async function countPoints(code: string): Promise<number> {
	await actAsAdmin(db);
	const { rows } = await db.query<{ n: number }>(
		'select count(*)::int as n from public.points where code = $1',
		[code]
	);
	return rows[0].n;
}

async function distanceFromPoint(id: string, at: LatLng): Promise<number> {
	await actAsAdmin(db);
	const { rows } = await db.query<{ d: number }>(
		`select extensions.st_distance(location,
			extensions.st_setsrid(extensions.st_makepoint($2, $3), 4326)::extensions.geography) as d
		 from public.points where id = $1`,
		[id, at.lng, at.lat]
	);
	return rows[0].d;
}

describe('record_withdrawal: dedupe', () => {
	it('creates a point the first time someone withdraws at a new place', async () => {
		const result = await withdrawOk(alice, { code: '54321' });

		expect(result.outcome).toBe('created');
		expect(await point(result.point_id)).toMatchObject({
			network_id: 'mtn',
			code: '54321',
			withdrawal_count: 1
		});
	});

	it('attaches another user at the same place and code instead of creating a duplicate', async () => {
		const first = await withdrawOk(alice, { code: '54321' });
		const second = await withdrawOk(bob, { code: '54321', at: offsetMeters(DOUALA, 30) });

		expect(second).toEqual({ point_id: first.point_id, outcome: 'attached' });
		expect(await countPoints('54321')).toBe(1);
		expect((await point(first.point_id)).withdrawal_count).toBe(2);
	});

	it('treats the same code within 300 m as the same agent (GPS drift)', async () => {
		const first = await withdrawOk(alice, { code: '54321' });
		const second = await withdrawOk(bob, { code: '54321', at: offsetMeters(DOUALA, 250) });

		expect(second.point_id).toBe(first.point_id);
		expect(await countPoints('54321')).toBe(1);
	});

	it('creates a separate point for the same code more than 300 m away', async () => {
		const first = await withdrawOk(alice, { code: '54321' });
		const second = await withdrawOk(bob, { code: '54321', at: offsetMeters(DOUALA, 600) });

		expect(second.outcome).toBe('created');
		expect(second.point_id).not.toBe(first.point_id);
	});

	it('keeps different networks with the same code apart', async () => {
		const mtn = await withdrawOk(alice, { network: 'mtn', code: '54321' });
		const orange = await withdrawOk(bob, { network: 'orange', code: '54321' });

		expect(orange.outcome).toBe('created');
		expect(orange.point_id).not.toBe(mtn.point_id);
	});

	it('moves the point to a more accurate fix, never a less accurate one', async () => {
		const better = offsetMeters(DOUALA, 40);
		const worse = offsetMeters(DOUALA, 80);
		const { point_id } = await withdrawOk(alice, { code: '54321', accuracy: 60 });

		await withdrawOk(bob, { code: '54321', at: better, accuracy: 10 });
		expect(await distanceFromPoint(point_id, better)).toBeLessThan(1);
		expect((await point(point_id)).accuracy_m).toBe(10);

		await withdrawOk(bob, { code: '54321', at: worse, accuracy: 30 });
		expect(await distanceFromPoint(point_id, better)).toBeLessThan(1);
	});

	it('records a withdrawal at a tapped point without creating a new one, even from afar', async () => {
		const first = await withdrawOk(alice, { code: '54321' });
		const tapped = await withdrawOk(bob, {
			code: '54321',
			pointId: first.point_id,
			at: offsetMeters(DOUALA, 1500)
		});

		expect(tapped).toEqual({ point_id: first.point_id, outcome: 'attached' });
		expect(await countPoints('54321')).toBe(1);
	});

	it('accepts a tapped point when the device has no location', async () => {
		const first = await withdrawOk(alice, { code: '54321' });
		const tapped = await withdrawOk(bob, { code: '54321', pointId: first.point_id, at: null });

		expect(tapped.outcome).toBe('attached');
	});

	it('rejects a tapped point whose network or code does not match', async () => {
		const first = await withdrawOk(alice, { code: '54321' });

		await expectRejected(bob, { code: '99999', pointId: first.point_id }, 'point_mismatch');
		await expectRejected(bob, { network: 'orange', code: '54321', pointId: first.point_id }, 'point_mismatch');
	});

	it('rejects an unknown or hidden tapped point', async () => {
		const first = await withdrawOk(alice, { code: '54321' });
		await actAsAdmin(db);
		await db.query(`update public.points set status = 'hidden' where id = $1`, [first.point_id]);

		await expectRejected(bob, { code: '54321', pointId: first.point_id }, 'point_not_found');
		await expectRejected(bob, { code: '54321', pointId: randomUUID() }, 'point_not_found');
	});
});

describe('record_withdrawal: offline retries', () => {
	it('is idempotent per device-generated id', async () => {
		const clientUuid = randomUUID();
		const first = await withdrawOk(alice, { code: '54321', clientUuid });
		const retry = await withdrawOk(alice, { code: '54321', clientUuid });

		expect(retry).toEqual({ point_id: first.point_id, outcome: 'duplicate' });
		expect((await point(first.point_id)).withdrawal_count).toBe(1);
	});

	it('keeps the device time of queued events', async () => {
		const capturedAt = minutesBeforeNow(180);
		const { point_id } = await withdrawOk(alice, { code: '54321', capturedAt });

		expect((await point(point_id)).last_withdrawal_at?.getTime()).toBe(capturedAt.getTime());
	});

	it('clamps future device times to now', async () => {
		const { point_id } = await withdrawOk(alice, {
			code: '54321',
			capturedAt: new Date(now.getTime() + 86_400_000)
		});

		expect((await point(point_id)).last_withdrawal_at?.getTime()).toBe(now.getTime());
	});

	it('rejects events older than 7 days', async () => {
		await expectRejected(alice, { capturedAt: minutesBeforeNow(8 * 24 * 60) }, 'stale_event');
	});
});

describe('record_withdrawal: validation', () => {
	it('rejects unknown networks', async () => {
		await expectRejected(alice, { network: 'wave' }, 'invalid_network');
	});

	it.each(['123', '1234567', '12a45', ''])('rejects the code %j', async (code) => {
		await expectRejected(alice, { code }, 'invalid_code');
	});

	it.each(['1234', '123456'])('accepts the 4-6 digit code %s', async (code) => {
		expect((await withdrawOk(alice, { code })).outcome).toBe('created');
	});

	it('enforces the 500 XAF minimum and has no maximum', async () => {
		await expectRejected(alice, { amount: 499 }, 'invalid_amount');
		expect((await withdrawOk(alice, { code: '1111', amount: 500 })).outcome).toBe('created');
		expect((await withdrawOk(alice, { code: '1111', amount: 2_000_000 })).outcome).toBe('attached');
	});

	it('requires a location to place a new point', async () => {
		await expectRejected(alice, { at: null }, 'location_required');
	});

	it('rejects malformed coordinates', async () => {
		await expectRejected(alice, { at: { lat: 95, lng: 9.7 } }, 'invalid_location');
	});
});

describe('record_withdrawal: abuse protection', () => {
	it('needs an accurate fix to create a point but not to attach to one', async () => {
		await expectRejected(alice, { accuracy: 150 }, 'location_inaccurate');

		await withdrawOk(alice, { code: '54321', accuracy: 20 });
		expect((await withdrawOk(bob, { code: '54321', accuracy: 150 })).outcome).toBe('attached');
	});

	it('only creates points in Cameroon', async () => {
		await expectRejected(alice, { at: { lat: 6.5244, lng: 3.3792 } }, 'outside_service_area');
	});

	it('limits each user to 5 new points per day', async () => {
		for (let i = 0; i < 5; i++) {
			await withdrawOk(alice, { code: `100${i}`, at: offsetMeters(DOUALA, i * 40), minutesAgo: 10 - i });
		}

		await expectRejected(alice, { code: '1009', at: offsetMeters(DOUALA, 400) }, 'daily_point_limit');
		expect((await withdrawOk(bob, { code: '1009', at: offsetMeters(DOUALA, 400) })).outcome).toBe('created');
	});

	it('rejects a second new point of the same network right next to the user’s last one', async () => {
		await withdrawOk(alice, { code: '1111', minutesAgo: 2 });

		await expectRejected(alice, { code: '2222', at: offsetMeters(DOUALA, 10) }, 'too_close');
		expect((await withdrawOk(alice, { network: 'orange', code: '2222' })).outcome).toBe('created');
		expect((await withdrawOk(bob, { code: '2222', at: offsetMeters(DOUALA, 10) })).outcome).toBe('created');
	});

	it('rejects impossible location jumps', async () => {
		await withdrawOk(alice, { code: '1111', minutesAgo: 10 });

		await expectRejected(alice, { code: '2222', at: YAOUNDE }, 'impossible_jump');
	});

	it('allows plausible travel between cities', async () => {
		await withdrawOk(alice, { code: '1111', minutesAgo: 5 * 60 });

		expect((await withdrawOk(alice, { code: '2222', at: YAOUNDE })).outcome).toBe('created');
	});

	it('raises the public count at most once per user per point every 6 hours', async () => {
		const { point_id } = await withdrawOk(alice, { code: '54321', minutesAgo: 8 * 60 });
		await withdrawOk(alice, { code: '54321', minutesAgo: 7 * 60 });
		expect((await point(point_id)).withdrawal_count).toBe(1);

		await withdrawOk(bob, { code: '54321', minutesAgo: 6 * 60 });
		expect((await point(point_id)).withdrawal_count).toBe(2);

		await withdrawOk(alice, { code: '54321' });
		expect((await point(point_id)).withdrawal_count).toBe(3);
	});

	it('limits each user to 30 recorded withdrawals per day', async () => {
		for (let i = 0; i < 30; i++) {
			await withdrawOk(alice, { code: '54321', minutesAgo: 60 - i });
		}

		await expectRejected(alice, { code: '54321' }, 'daily_withdrawal_limit');
	});
});

describe('points_in_bbox and nearby_points', () => {
	const bbox = [9.7, 4.0, 9.8, 4.1] as const;

	async function pointsInBbox(since: Date | null = null, sinceId: string | null = null) {
		await actAs(db, bob);
		const { rows } = await db.query<Record<string, unknown>>(
			'select * from public.points_in_bbox($1, $2, $3, $4, $5, $6)',
			[...bbox, since, sinceId]
		);
		return rows;
	}

	it('returns points in the box with coordinates and no user data', async () => {
		const { point_id } = await withdrawOk(alice, { code: '54321' });
		await withdrawOk(bob, { code: '1111', at: YAOUNDE });

		const rows = await pointsInBbox();

		expect(rows.map((row) => row.id)).toEqual([point_id]);
		expect(Object.keys(rows[0]).sort()).toEqual(
			[
				'accuracy_m',
				'code',
				'id',
				'last_withdrawal_at',
				'lat',
				'lng',
				'network_id',
				'status',
				'updated_at',
				'withdrawal_count'
			].sort()
		);
		expect(rows[0].lat).toBeCloseTo(DOUALA.lat, 6);
		expect(rows[0].lng).toBeCloseTo(DOUALA.lng, 6);
	});

	it('returns only points changed after the cursor, including hidden ones', async () => {
		const first = await withdrawOk(alice, { code: '1111', minutesAgo: 3 });
		const [cursor] = await pointsInBbox();
		const second = await withdrawOk(bob, { code: '2222', at: offsetMeters(DOUALA, 500), minutesAgo: 2 });
		await actAsAdmin(db);
		await db.query(`update public.points set status = 'hidden' where id = $1`, [first.point_id]);

		const changed = await pointsInBbox(cursor.updated_at as Date, cursor.id as string);

		expect(changed.map((row) => [row.id, row.status])).toEqual([
			[second.point_id, 'active'],
			[first.point_id, 'hidden']
		]);
	});

	it('lists the nearest active points first with their distance', async () => {
		const far = await withdrawOk(alice, { code: '1111', at: offsetMeters(DOUALA, 900), minutesAgo: 3 });
		const near = await withdrawOk(bob, { code: '2222', at: offsetMeters(DOUALA, 100), minutesAgo: 2 });
		const hidden = await withdrawOk(bob, { code: '3333', at: offsetMeters(DOUALA, 300), minutesAgo: 1 });
		await actAsAdmin(db);
		await db.query(`update public.points set status = 'hidden' where id = $1`, [hidden.point_id]);

		await actAs(db, alice);
		const { rows } = await db.query<{ id: string; distance_m: number }>(
			'select id, distance_m from public.nearby_points($1, $2, 2000)',
			[DOUALA.lat, DOUALA.lng]
		);

		expect(rows.map((row) => row.id)).toEqual([near.point_id, far.point_id]);
		expect(rows[0].distance_m).toBeGreaterThan(90);
		expect(rows[0].distance_m).toBeLessThan(110);
	});
});
