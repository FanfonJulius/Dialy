import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DailyDatabase, clearUserData } from '#lib/data/local/db.js';
import type { HistoryEntry, ServerWithdrawal } from '#lib/domain/history.js';
import { pullHistory } from './history-sync.js';

function serverWithdrawal(clientUuid: string, pointId: string, active = true): ServerWithdrawal {
	return {
		clientUuid,
		amount: 20000,
		dialedAt: '2026-10-16T14:30:00.000Z',
		active,
		point: {
			id: pointId,
			network: 'mtn',
			code: '24680',
			lat: 3.868,
			lng: 11.5175,
			accuracyM: 12,
			withdrawalCount: 3,
			lastWithdrawalAt: null,
			updatedAt: '2026-10-16T14:30:00.000Z'
		}
	};
}

const donation: HistoryEntry = {
	id: 'd1',
	userId: 'u1',
	kind: 'donation',
	network: 'orange',
	code: '691425334',
	amount: 1000,
	dialedAt: '2026-10-17T08:00:00.000Z',
	pointId: null
};

describe('pullHistory', () => {
	let db: DailyDatabase;

	beforeEach(() => {
		db = new DailyDatabase(`test-${randomUUID()}`);
	});

	afterEach(async () => {
		await db.delete();
	});

	it('adds withdrawals from the server and keeps what only this phone knows', async () => {
		await db.history.put(donation);
		await db.history.put({ ...donation, id: 'w1', kind: 'withdrawal', network: 'mtn', code: '24680', pointId: null });

		await pullHistory(db, 'u1', async () => [serverWithdrawal('w1', 'p1'), serverWithdrawal('w2', 'p1')]);

		const entries = await db.history.toArray();
		expect(entries.map((entry) => entry.id).sort()).toEqual(['d1', 'w1', 'w2']);
		expect(await db.history.get('w1')).toMatchObject({ userId: 'u1', kind: 'withdrawal', amount: 20000, pointId: 'p1' });
		expect(await db.points.get('p1')).toMatchObject({ code: '24680', cell: expect.any(String) });
	});

	it('does not put hidden points back on the map', async () => {
		await pullHistory(db, 'u1', async () => [serverWithdrawal('w1', 'gone', false)]);

		expect(await db.history.get('w1')).toMatchObject({ pointId: 'gone' });
		expect(await db.points.get('gone')).toBeUndefined();
	});

	it('is cleared with the rest of the account data on sign-out', async () => {
		await db.history.put(donation);
		await clearUserData(db);
		expect(await db.history.count()).toBe(0);
	});
});
