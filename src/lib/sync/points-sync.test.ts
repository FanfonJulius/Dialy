import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DailyDatabase } from '#lib/data/local/db.js';
import {
	CELL_REFRESH_MS,
	MAX_CELLS_PER_SYNC,
	PAGE_SIZE,
	PointsSync,
	cellOf,
	placeCreatedPoint,
	syncCell,
	type PointsPageRequest
} from './points-sync.js';

const DOUALA = { lat: 4.0511, lng: 9.7679 };
const CELL = cellOf(DOUALA.lat, DOUALA.lng);

function row(index: number, overrides: Record<string, unknown> = {}) {
	return {
		id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
		network_id: 'mtn',
		code: String(10_000 + index),
		lat: DOUALA.lat,
		lng: DOUALA.lng,
		accuracy_m: 10,
		withdrawal_count: 1,
		last_withdrawal_at: null,
		status: 'active',
		updated_at: new Date(Date.UTC(2026, 9, 13, 9, 0, 0, index)).toISOString(),
		...overrides
	};
}

let db: DailyDatabase;

beforeEach(() => {
	db = new DailyDatabase(`test-${randomUUID()}`);
});

afterEach(async () => {
	await db.delete();
});

describe('syncCell', () => {
	it('stores the points of a cell and records the newest row as cursor', async () => {
		const requests: PointsPageRequest[] = [];
		await syncCell(db, CELL, async (request) => {
			requests.push(request);
			return [row(1), row(2)];
		});

		expect(await db.points.count()).toBe(2);
		expect(await db.points.get(row(1).id)).toMatchObject({ code: '10001', cell: CELL });
		expect(requests[0]).toMatchObject({ cell: CELL, since: null, sinceId: null, limit: PAGE_SIZE });
		expect(await db.cells.get(CELL)).toMatchObject({ cursorUpdatedAt: row(2).updated_at, cursorId: row(2).id });
	});

	it('asks only for changes since the cursor, minus a safety overlap', async () => {
		await syncCell(db, CELL, async () => [row(1)]);
		const requests: PointsPageRequest[] = [];

		await syncCell(db, CELL, async (request) => {
			requests.push(request);
			return [];
		});

		const cursor = Date.parse(row(1).updated_at);
		expect(Date.parse(requests[0].since ?? '')).toBe(cursor - 2 * 60_000);
		expect(await db.cells.get(CELL)).toMatchObject({ cursorUpdatedAt: row(1).updated_at });
	});

	it('pages through large cells with the last row as cursor', async () => {
		const requests: PointsPageRequest[] = [];
		const firstPage = Array.from({ length: PAGE_SIZE }, (_, i) => row(i));

		await syncCell(db, CELL, async (request) => {
			requests.push(request);
			return requests.length === 1 ? firstPage : [row(PAGE_SIZE)];
		});

		expect(requests).toHaveLength(2);
		expect(requests[1]).toMatchObject({ since: firstPage.at(-1)?.updated_at, sinceId: firstPage.at(-1)?.id });
		expect(await db.points.count()).toBe(PAGE_SIZE + 1);
	});

	it('removes points the server has hidden and ignores malformed rows', async () => {
		await syncCell(db, CELL, async () => [row(1), row(2)]);

		await syncCell(db, CELL, async () => [row(1, { status: 'hidden' }), row(3, { code: 'DROP TABLE' })]);

		expect((await db.points.toArray()).map((point) => point.id)).toEqual([row(2).id]);
	});
});

describe('PointsSync.syncArea', () => {
	const around = { west: 9.76, south: 4.04, east: 9.77, north: 4.06 };

	it('skips areas larger than a city to save data', async () => {
		const sync = new PointsSync(db, async () => []);
		const result = await sync.syncArea({ west: 9, south: 3, east: 12, north: 6 });
		expect(result).toEqual({ status: 'area-too-large' });
		expect(MAX_CELLS_PER_SYNC).toBeLessThan(100);
	});

	it('does not refetch a cell synced less than 2 minutes ago', async () => {
		let calls = 0;
		const sync = new PointsSync(db, async () => {
			calls++;
			return [];
		});
		const now = Date.now();

		await sync.syncArea(around, now);
		const first = calls;
		await sync.syncArea(around, now + CELL_REFRESH_MS - 1);
		expect(calls).toBe(first);

		await sync.syncArea(around, now + CELL_REFRESH_MS);
		expect(calls).toBe(first * 2);
	});

	it('keeps other cells syncing when one request fails', async () => {
		let calls = 0;
		const sync = new PointsSync(db, async () => {
			calls++;
			if (calls === 1) throw new Error('offline');
			return [];
		});

		const result = await sync.syncArea({ west: 9.76, south: 4.04, east: 9.85, north: 4.06 });

		expect(result.status).toBe('synced');
		if (result.status === 'synced') {
			expect(result.failed).toBe(1);
			expect(result.cells).toBeGreaterThan(1);
		}
	});
});

describe('PointsSync.refreshAt', () => {
	it('fetches the cell again when a sync of it was already running (it may predate the change)', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		let fetching!: () => void;
		const firstFetchStarted = new Promise<void>((resolve) => (fetching = resolve));
		let calls = 0;
		const sync = new PointsSync(db, async () => {
			calls++;
			if (calls === 1) {
				fetching();
				await gate;
			}
			return calls === 1 ? [] : [row(1)];
		});
		const running = sync.syncArea({ west: 9.767, south: 4.05, east: 9.768, north: 4.052 });
		await firstFetchStarted;

		const refreshed = sync.refreshAt(DOUALA);
		release();
		await Promise.all([running, refreshed]);

		expect(calls).toBe(2);
		expect(await db.points.get(row(1).id)).toBeDefined();
	});
});

describe('placeCreatedPoint', () => {
	const created = {
		clientUuid: 'c1',
		network: 'orange',
		code: '97531',
		amount: 2500,
		capturedAt: '2026-11-16T09:00:00.000Z',
		pointId: null,
		location: { lat: 4.0511, lng: 9.7679, accuracyM: 14 }
	};

	it('puts a point the server just created on the map at once', async () => {
		await placeCreatedPoint(db, 'p-new', created);

		expect(await db.points.get('p-new')).toMatchObject({
			network: 'orange',
			code: '97531',
			lat: 4.0511,
			lng: 9.7679,
			accuracyM: 14,
			withdrawalCount: 1,
			lastWithdrawalAt: created.capturedAt,
			cell: CELL
		});
	});

	it('never overwrites the copy already received from the server', async () => {
		await syncCell(db, CELL, async () => [row(1, { code: '97531' })]);

		await placeCreatedPoint(db, row(1).id, created);

		expect(await db.points.get(row(1).id)).toMatchObject({ network: 'mtn', accuracyM: 10 });
	});
});
