import { describe, expect, it } from 'vitest';
import { historyPoints, parseWithdrawalHistory, type HistoryEntry } from './history.ts';

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
	return {
		id: crypto.randomUUID(),
		userId: 'u1',
		kind: 'withdrawal',
		network: 'mtn',
		code: '24680',
		amount: 5000,
		dialedAt: '2026-10-17T08:00:00.000Z',
		pointId: 'p1',
		...overrides
	};
}

describe('historyPoints', () => {
	it('groups withdrawals by point, most recently used first', () => {
		const points = historyPoints([
			entry({ pointId: 'p1', amount: 5000, dialedAt: '2026-10-15T08:00:00.000Z' }),
			entry({ pointId: 'p2', network: 'orange', code: '13579', amount: 2000, dialedAt: '2026-10-16T08:00:00.000Z' }),
			entry({ pointId: 'p1', amount: 10000, dialedAt: '2026-10-17T08:00:00.000Z' })
		]);

		expect(points).toEqual([
			{ key: 'p1', pointId: 'p1', network: 'mtn', code: '24680', withdrawals: 2, total: 15000, lastAt: '2026-10-17T08:00:00.000Z' },
			{ key: 'p2', pointId: 'p2', network: 'orange', code: '13579', withdrawals: 1, total: 2000, lastAt: '2026-10-16T08:00:00.000Z' }
		]);
	});

	it('leaves donations out and groups a new point by network and code until it is known', () => {
		const points = historyPoints([
			entry({ kind: 'donation', pointId: null, code: '654571914' }),
			entry({ pointId: null, code: '97531' }),
			entry({ pointId: null, code: '97531', dialedAt: '2026-10-17T09:00:00.000Z' })
		]);

		expect(points).toEqual([
			{ key: 'mtn:97531', pointId: null, network: 'mtn', code: '97531', withdrawals: 2, total: 10000, lastAt: '2026-10-17T09:00:00.000Z' }
		]);
	});
});

describe('parseWithdrawalHistory', () => {
	const row = {
		client_uuid: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b',
		amount: 20000,
		captured_at: '2026-10-16T14:30:00+00:00',
		point_id: '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d',
		network_id: 'mtn',
		code: '24680',
		lat: 3.868,
		lng: 11.5175,
		accuracy_m: 12,
		withdrawal_count: 3,
		last_withdrawal_at: '2026-10-16T14:30:00+00:00',
		updated_at: '2026-10-16T14:30:00+00:00',
		status: 'active'
	};

	it('reads my_withdrawals rows with their points, in one time format', () => {
		expect(parseWithdrawalHistory([row])).toEqual([
			{
				clientUuid: row.client_uuid,
				amount: 20000,
				dialedAt: '2026-10-16T14:30:00.000Z',
				active: true,
				point: {
					id: row.point_id,
					network: 'mtn',
					code: '24680',
					lat: 3.868,
					lng: 11.5175,
					accuracyM: 12,
					withdrawalCount: 3,
					lastWithdrawalAt: row.last_withdrawal_at,
					updatedAt: row.updated_at
				}
			}
		]);
	});

	it('drops malformed rows', () => {
		expect(parseWithdrawalHistory([{ ...row, amount: -5 }, { ...row, client_uuid: 'nope' }, null])).toEqual([]);
		expect(parseWithdrawalHistory('error')).toEqual([]);
	});
});
