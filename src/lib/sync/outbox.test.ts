import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyDatabase } from '#lib/data/local/db.js';
import { NetworkError } from '#lib/data/supabase/errors.js';
import type { WithdrawalRequest } from '#lib/domain/withdrawal.js';
import { MAX_ATTEMPTS, Outbox, isPermanentError, type OutboxEvent, type OutboxSenders } from './outbox.js';

const ALICE = 'alice';
const OFFLINE = { message: 'TypeError: Failed to fetch', code: '' };

function request(overrides: Partial<WithdrawalRequest> = {}): WithdrawalRequest {
	return {
		clientUuid: randomUUID(),
		network: 'mtn',
		code: '123456',
		amount: 5000,
		capturedAt: '2026-10-14T10:00:00.000Z',
		pointId: null,
		location: { lat: 4.05, lng: 9.76, accuracyM: 12 },
		...overrides
	};
}

let db: DailyDatabase;
let events: OutboxEvent[];

function outbox(senders: Partial<OutboxSenders>): Outbox {
	return new Outbox(
		db,
		{
			withdrawal: senders.withdrawal ?? vi.fn(async () => ({ pointId: 'p1', outcome: 'created' as const })),
			saved: senders.saved ?? vi.fn(async () => {})
		},
		(event) => events.push(event)
	);
}

beforeEach(() => {
	db = new DailyDatabase(`test-${randomUUID()}`);
	events = [];
});

afterEach(async () => {
	await db.delete();
});

describe('isPermanentError', () => {
	it('treats rule violations and bad data as permanent, everything else as retryable', () => {
		expect(isPermanentError({ code: 'P0001', message: 'too_close' })).toBe(true);
		expect(isPermanentError({ code: '23503' })).toBe(true);
		expect(isPermanentError({ code: '22P02' })).toBe(true);
		expect(isPermanentError(OFFLINE)).toBe(false);
		expect(isPermanentError({ code: 'PGRST301' })).toBe(false);
		expect(isPermanentError(new Error('boom'))).toBe(false);
	});
});

describe('Outbox', () => {
	it('sends withdrawals in the order they were dialed and reports the outcome', async () => {
		const sent: string[] = [];
		const box = outbox({
			withdrawal: async (r) => {
				sent.push(r.code);
				return { pointId: `point-${r.code}`, outcome: 'attached' };
			}
		});
		const first = request({ code: '1111' });
		await box.enqueueWithdrawal(ALICE, first);
		await new Promise((resolve) => setTimeout(resolve, 2));
		await box.enqueueWithdrawal(ALICE, request({ code: '2222' }));

		expect(await box.flush(ALICE)).toEqual({ sent: 2, dropped: 0, remaining: 0 });
		expect(sent).toEqual(['1111', '2222']);
		expect(events[0]).toEqual({ type: 'withdrawal-recorded', request: first, pointId: 'point-1111', outcome: 'attached' });
		expect(await db.outbox.count()).toBe(0);
	});

	it('keeps everything while offline and sends it later', async () => {
		let online = false;
		const box = outbox({
			withdrawal: async () => {
				if (!online) throw OFFLINE;
				return { pointId: 'p', outcome: 'created' };
			}
		});
		await box.enqueueWithdrawal(ALICE, request());

		expect(await box.flush(ALICE)).toEqual({ sent: 0, dropped: 0, remaining: 1 });
		expect((await db.outbox.toArray())[0].attempts).toBe(1);

		online = true;
		expect(await box.flush(ALICE)).toMatchObject({ sent: 1, remaining: 0 });
	});

	it('drops a withdrawal the server rejects and says why', async () => {
		const rejected = request();
		const box = outbox({
			withdrawal: async () => {
				throw { code: 'P0001', message: 'location_inaccurate' };
			}
		});
		await box.enqueueWithdrawal(ALICE, rejected);

		expect(await box.flush(ALICE)).toMatchObject({ sent: 0, dropped: 1, remaining: 0 });
		expect(events).toEqual([{ type: 'withdrawal-rejected', request: rejected, reason: 'location_inaccurate' }]);
	});

	it('gives up on an entry after too many failed attempts', async () => {
		const box = outbox({
			withdrawal: async () => {
				throw OFFLINE;
			}
		});
		await box.enqueueWithdrawal(ALICE, request());

		for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) await box.flush(ALICE);
		expect(await db.outbox.count()).toBe(1);
		await box.flush(ALICE);
		expect(await db.outbox.count()).toBe(0);
		expect(events).toMatchObject([{ type: 'withdrawal-rejected', reason: 'unknown' }]);
	});

	it('keeps an entry indefinitely while the server cannot be reached', async () => {
		const box = outbox({
			withdrawal: async () => {
				throw new NetworkError('Failed to fetch');
			}
		});
		await box.enqueueWithdrawal(ALICE, request());

		for (let attempt = 0; attempt < MAX_ATTEMPTS * 2; attempt++) await box.flush(ALICE);
		const [entry] = await db.outbox.toArray();
		expect(entry.attempts).toBe(0);
		expect(events).toEqual([]);
	});

	it('never sends another account\u2019s entries', async () => {
		const withdrawal = vi.fn(async () => ({ pointId: 'p', outcome: 'created' as const }));
		const box = outbox({ withdrawal });
		await box.enqueueWithdrawal('bob', request());

		await box.flush(ALICE);
		expect(withdrawal).not.toHaveBeenCalled();
		expect(await db.outbox.count()).toBe(0);
	});

	it('keeps only the latest save intent per point', async () => {
		const saved = vi.fn(async () => {});
		const box = outbox({ saved });
		await box.enqueueSaved(ALICE, 'p1', true);
		await box.enqueueSaved(ALICE, 'p1', false);
		await box.enqueueSaved(ALICE, 'p2', true);

		await box.flush(ALICE);
		expect(saved.mock.calls).toEqual(
			expect.arrayContaining([
				['p1', false],
				['p2', true]
			])
		);
		expect(saved).toHaveBeenCalledTimes(2);
	});

	it('runs one flush at a time and picks up entries added meanwhile', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const sent: string[] = [];
		const box = outbox({
			withdrawal: async (r) => {
				if (sent.length === 0) await gate;
				sent.push(r.code);
				return { pointId: 'p', outcome: 'attached' };
			}
		});
		await box.enqueueWithdrawal(ALICE, request({ code: '1111' }));
		const running = box.flush(ALICE);
		await new Promise((resolve) => setTimeout(resolve, 5));
		await box.enqueueWithdrawal(ALICE, request({ code: '2222' }));
		expect(await box.flush(ALICE)).toEqual({ sent: 0, dropped: 0, remaining: 0 });

		release();
		await running;
		expect(sent).toEqual(['1111', '2222']);
	});
});
