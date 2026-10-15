import type { DailyDatabase, OutboxEntry } from '#lib/data/local/db.js';
import { NetworkError } from '#lib/data/supabase/errors.js';
import {
	withdrawalRejection,
	type WithdrawalOutcome,
	type WithdrawalRejection,
	type WithdrawalRequest
} from '#lib/domain/withdrawal.js';

/** After this many server errors an entry is dropped, so one bad entry cannot block the queue forever. */
export const MAX_ATTEMPTS = 8;

export type OutboxSenders = {
	withdrawal: (request: WithdrawalRequest) => Promise<{ pointId: string; outcome: WithdrawalOutcome }>;
	saved: (pointId: string, saved: boolean) => Promise<void>;
};

export type OutboxEvent =
	| { type: 'withdrawal-recorded'; request: WithdrawalRequest; pointId: string; outcome: WithdrawalOutcome }
	| { type: 'withdrawal-rejected'; request: WithdrawalRequest; reason: WithdrawalRejection }
	| { type: 'saved-rejected'; pointId: string; saved: boolean };

export type FlushResult = { sent: number; dropped: number; remaining: number };

function errorField(error: unknown, field: 'code' | 'message'): string {
	if (typeof error !== 'object' || error === null || !(field in error)) return '';
	return String((error as Record<string, unknown>)[field]);
}

/**
 * Business-rule rejections (P0001) and invalid data (22xxx, 23xxx) fail the same way on every try.
 * Anything else (no network, expired session, server hiccup) is worth retrying.
 */
export function isPermanentError(error: unknown): boolean {
	const code = errorField(error, 'code');
	return code === 'P0001' || code.startsWith('22') || code.startsWith('23');
}

/** Changes made on the device, sent to the server in order once it can be reached. */
export class Outbox {
	#db: DailyDatabase;
	#senders: OutboxSenders;
	#onEvent: (event: OutboxEvent) => void;
	#running = false;
	#again = false;

	constructor(db: DailyDatabase, senders: OutboxSenders, onEvent: (event: OutboxEvent) => void = () => {}) {
		this.#db = db;
		this.#senders = senders;
		this.#onEvent = onEvent;
	}

	async enqueueWithdrawal(userId: string, request: WithdrawalRequest): Promise<void> {
		await this.#db.outbox.put({
			id: request.clientUuid,
			userId,
			createdAt: Date.now(),
			attempts: 0,
			kind: 'withdrawal',
			request
		});
	}

	/** Only the latest intent for a point matters, so earlier unsent ones are replaced. */
	async enqueueSaved(userId: string, pointId: string, saved: boolean): Promise<void> {
		await this.#db.transaction('rw', this.#db.outbox, async () => {
			await this.#db.outbox
				.filter((entry) => entry.kind === 'saved' && entry.pointId === pointId && entry.userId === userId)
				.delete();
			await this.#db.outbox.add({
				id: crypto.randomUUID(),
				userId,
				createdAt: Date.now(),
				attempts: 0,
				kind: 'saved',
				pointId,
				saved
			});
		});
	}

	/** Sends this account's entries oldest first; stops at the first retryable failure. */
	async flush(userId: string): Promise<FlushResult> {
		const total: FlushResult = { sent: 0, dropped: 0, remaining: 0 };
		if (this.#running) {
			this.#again = true;
			return total;
		}
		this.#running = true;
		try {
			do {
				this.#again = false;
				const result = await this.#flushOnce(userId);
				total.sent += result.sent;
				total.dropped += result.dropped;
				total.remaining = result.remaining;
			} while (this.#again);
		} finally {
			this.#running = false;
		}
		return total;
	}

	async #flushOnce(userId: string): Promise<FlushResult> {
		const result: FlushResult = { sent: 0, dropped: 0, remaining: 0 };
		const entries = await this.#db.outbox.orderBy('createdAt').toArray();
		const foreign = entries.filter((entry) => entry.userId !== userId);
		// Another account's changes are never sent under this one.
		await this.#db.outbox.bulkDelete(foreign.map((entry) => entry.id));
		const own = entries.filter((entry) => entry.userId === userId);

		for (const [index, entry] of own.entries()) {
			try {
				await this.#send(entry);
				await this.#db.outbox.delete(entry.id);
				result.sent++;
			} catch (error) {
				const stopped = { ...result, remaining: own.length - index };
				// Unreachable server: wait for the next chance without using up the entry's attempts.
				if (error instanceof NetworkError) return stopped;
				if (isPermanentError(error) || entry.attempts + 1 >= MAX_ATTEMPTS) {
					await this.#db.outbox.delete(entry.id);
					result.dropped++;
					this.#reject(entry, error);
					continue;
				}
				await this.#db.outbox.update(entry.id, { attempts: entry.attempts + 1 });
				return stopped;
			}
		}
		return result;
	}

	async #send(entry: OutboxEntry): Promise<void> {
		if (entry.kind === 'saved') {
			await this.#senders.saved(entry.pointId, entry.saved);
			return;
		}
		const { pointId, outcome } = await this.#senders.withdrawal(entry.request);
		this.#onEvent({ type: 'withdrawal-recorded', request: entry.request, pointId, outcome });
	}

	#reject(entry: OutboxEntry, error: unknown): void {
		if (entry.kind === 'saved') {
			this.#onEvent({ type: 'saved-rejected', pointId: entry.pointId, saved: entry.saved });
			return;
		}
		const reason = errorField(error, 'code') === 'P0001' ? withdrawalRejection(errorField(error, 'message')) : 'unknown';
		this.#onEvent({ type: 'withdrawal-rejected', request: entry.request, reason });
	}
}
