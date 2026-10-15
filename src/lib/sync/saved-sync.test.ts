import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DailyDatabase } from '#lib/data/local/db.js';
import type { CashPoint, SavedEntry } from '#lib/domain/points.js';
import { mergeSaved, pullSaved } from './saved-sync.js';

function entry(id: string, savedAt = '2026-10-14T08:00:00.000Z'): SavedEntry {
	const point: CashPoint = {
		id,
		network: 'mtn',
		code: '123456',
		lat: 3.87,
		lng: 11.52,
		accuracyM: 10,
		withdrawalCount: 2,
		lastWithdrawalAt: null,
		updatedAt: '2026-10-14T08:00:00.000Z'
	};
	return { point, savedAt };
}

describe('mergeSaved', () => {
	it('applies unsent saves and removals on top of the server list', () => {
		const merged = mergeSaved(
			[entry('a'), entry('b')],
			[
				{ pointId: 'b', saved: false, createdAt: 1 },
				{ pointId: 'c', saved: true, createdAt: Date.UTC(2026, 9, 14, 9) }
			]
		);
		expect(merged).toEqual([
			{ pointId: 'a', savedAt: '2026-10-14T08:00:00.000Z' },
			{ pointId: 'c', savedAt: '2026-10-14T09:00:00.000Z' }
		]);
	});
});

describe('pullSaved', () => {
	let db: DailyDatabase;

	beforeEach(() => {
		db = new DailyDatabase(`test-${randomUUID()}`);
	});

	afterEach(async () => {
		await db.delete();
	});

	it('replaces the local list and stores the points for offline use', async () => {
		await db.saved.put({ pointId: 'stale', savedAt: '2026-01-01T00:00:00.000Z' });
		await db.outbox.add({ id: 'o1', userId: 'u', createdAt: 5, attempts: 0, kind: 'saved', pointId: 'new', saved: true });

		await pullSaved(db, async () => [entry('a')]);

		expect((await db.saved.toArray()).map((s) => s.pointId).sort()).toEqual(['a', 'new']);
		expect(await db.points.get('a')).toMatchObject({ code: '123456', cell: expect.any(String) });
	});
});
