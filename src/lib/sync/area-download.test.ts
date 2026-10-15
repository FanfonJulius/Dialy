import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DailyDatabase } from '#lib/data/local/db.js';
import { TileStore } from '#lib/data/local/tile-store.js';
import { areaTiles } from '#lib/domain/area.js';
import type { TileManifest } from '#lib/domain/tile-manifest.js';
import type { FetchTile } from '#lib/map/tile-protocol.js';
import { downloadArea, refreshAreaPoints, AREA_POINTS_REFRESH_MS, type AreaDownloadDeps, type AreaProgress } from './area-download.js';
import { cellKeysForBounds, type FetchPointsPage } from './points-sync.js';

const manifest: TileManifest = {
	version: 1,
	build: 'b1',
	attribution: '',
	overview: { file: 'overview.pmtiles', maxZoom: 10 },
	detail: { cellZoom: 8, minZoom: 11, maxZoom: 14, cells: { '134/125': { file: 'cells/134-125.pmtiles', bytes: 1 } } }
};
const AREA = { west: 9.69, south: 4.03, east: 9.72, north: 4.06 };
const POINT = {
	id: '6f1c2a2e-2d1b-4c4f-9a57-3b8f0e9d1a01',
	network_id: 'orange',
	code: '13579',
	lat: 4.045,
	lng: 9.705,
	accuracy_m: 10,
	withdrawal_count: 2,
	last_withdrawal_at: null,
	status: 'active',
	updated_at: '2026-10-15T08:00:00.000Z'
};

let db: DailyDatabase;
let store: TileStore;
let tileRequests: string[];

const fetchTile: FetchTile = async (_file, z, x, y) => {
	tileRequests.push(`${z}/${x}/${y}`);
	return new ArrayBuffer(8);
};
const fetchPage: FetchPointsPage = async ({ bounds }) =>
	POINT.lng >= bounds.west && POINT.lng <= bounds.east && POINT.lat >= bounds.south && POINT.lat <= bounds.north
		? [POINT]
		: [];

function deps(overrides: Partial<AreaDownloadDeps> = {}): AreaDownloadDeps {
	return { db, store, fetchTile, fetchPage, manifest, ...overrides };
}

beforeEach(() => {
	db = new DailyDatabase(`test-${randomUUID()}`);
	store = new TileStore(db);
	tileRequests = [];
});

afterEach(async () => {
	await db.delete();
});

describe('downloadArea', () => {
	it('stores every tile and point of the area for offline use', async () => {
		const progress: AreaProgress[] = [];
		const result = await downloadArea(deps(), 'home', AREA, new AbortController().signal, (p) => progress.push(p));

		const expectedTiles = areaTiles(manifest, AREA).length;
		expect(result).toEqual({ complete: true, failedTiles: 0, failedCells: 0 });
		expect(await db.tiles.where('areas').equals('home').count()).toBe(expectedTiles);
		expect(await db.points.get(POINT.id)).toMatchObject({ code: '13579', network: 'orange' });
		expect(await db.cells.count()).toBe(cellKeysForBounds(AREA).length);
		expect(progress.at(-1)).toEqual({ done: expectedTiles + cellKeysForBounds(AREA).length, total: expectedTiles + cellKeysForBounds(AREA).length });
	});

	it('resumes without fetching tiles it already has', async () => {
		await downloadArea(deps(), 'home', AREA, new AbortController().signal, () => {});
		tileRequests = [];

		await downloadArea(deps(), 'home', AREA, new AbortController().signal, () => {});
		expect(tileRequests).toEqual([]);
	});

	it('reports failures instead of claiming the area is complete', async () => {
		let calls = 0;
		const flaky: FetchTile = async () => {
			if (++calls % 5 === 0) throw new Error('timeout');
			return new ArrayBuffer(1);
		};
		const result = await downloadArea(deps({ fetchTile: flaky }), 'home', AREA, new AbortController().signal, () => {});
		expect(result.complete).toBe(false);
		expect(result.failedTiles).toBeGreaterThan(0);
	});

	it('stops when cancelled', async () => {
		const controller = new AbortController();
		const slow: FetchTile = async () => {
			controller.abort();
			return new ArrayBuffer(1);
		};
		const result = await downloadArea(deps({ fetchTile: slow }), 'home', AREA, controller.signal, () => {});
		expect(result.complete).toBe(false);
		expect(await db.points.count()).toBe(0);
	});

	it('still downloads the points when no basemap is published', async () => {
		const result = await downloadArea(deps({ manifest: null }), 'home', AREA, new AbortController().signal, () => {});
		expect(result.complete).toBe(true);
		expect(await db.tiles.count()).toBe(0);
		expect(await db.points.count()).toBe(1);
	});
});

describe('refreshAreaPoints', () => {
	it('refreshes only the area cells that are out of date', async () => {
		const now = Date.UTC(2026, 9, 15, 12);
		const cells = cellKeysForBounds(AREA);
		await db.cells.bulkPut(
			cells.map((key, index) => ({
				key,
				cursorUpdatedAt: null,
				cursorId: null,
				syncedAt: index === 0 ? now - AREA_POINTS_REFRESH_MS : now - 60_000
			}))
		);

		const refreshed = await refreshAreaPoints(db, [{ bounds: AREA }, { bounds: AREA }], fetchPage, now);
		expect(refreshed).toBe(1);
		expect((await db.cells.get(cells[0]))?.syncedAt).toBe(now);
	});
});
