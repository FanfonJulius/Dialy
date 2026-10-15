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
		expect(requests[0]).toMatchObject({ since: null, sinceId: null, limit: PAGE_SIZE });
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
