import { liveQuery } from 'dexie';
import { db } from '#lib/data/local/db.js';
import { setSavedRemote } from '#lib/data/supabase/saved.js';
import { recordWithdrawal } from '#lib/data/supabase/withdrawals.js';
import type { WithdrawalRequest } from '#lib/domain/withdrawal.js';
import { Outbox, type OutboxEvent } from '#lib/sync/outbox.js';
import { pointsSync } from './local-data.svelte.js';
import { session } from './session.svelte.js';

const RETRY_INTERVAL_MS = 60_000;

/** Withdrawals and saved changes waiting for the server; flushed whenever Daily is online. */
class OutboxStore {
	/** Latest result worth telling the user about (a new point, a rejection). */
	notice = $state.raw<OutboxEvent | null>(null);
	pending = $state(0);
	#outbox = new Outbox(db, { withdrawal: recordWithdrawal, saved: setSavedRemote }, (event) => this.#onEvent(event));
	#started = false;
	#retryTimer: ReturnType<typeof setInterval> | null = null;

	start(): void {
		if (this.#started) return;
		this.#started = true;
		liveQuery(() => db.outbox.count()).subscribe({
			next: (count) => {
				this.pending = count;
				this.#scheduleRetry(count > 0);
			},
			error: (error) => console.error('Reading the outbox failed', error)
		});
		window.addEventListener('online', () => void this.flush());
		// Coming back from the phone dialer is a good moment to send the withdrawal just made.
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') void this.flush();
		});
		void this.flush();
	}

	/** Queues a dialed withdrawal; it reaches the server now or once back online. */
	async recordWithdrawal(request: WithdrawalRequest): Promise<void> {
		const userId = session.user?.id;
		if (!userId) return;
		await this.#outbox.enqueueWithdrawal(userId, request);
		void this.flush();
	}

	async setSaved(pointId: string, saved: boolean): Promise<void> {
		const userId = session.user?.id;
		if (!userId) return;
		await this.#outbox.enqueueSaved(userId, pointId, saved);
		void this.flush();
	}

	async flush(): Promise<void> {
		const userId = session.user?.id;
		if (!userId || !navigator.onLine) return;
		try {
			await this.#outbox.flush(userId);
		} catch (error) {
			console.error('Sending queued changes failed', error);
		}
	}

	dismiss(): void {
		this.notice = null;
	}

	// The browser's online flag can be wrong on weak networks, so waiting entries are also retried on a timer.
	#scheduleRetry(waiting: boolean): void {
		if (waiting && !this.#retryTimer) this.#retryTimer = setInterval(() => void this.flush(), RETRY_INTERVAL_MS);
		if (!waiting && this.#retryTimer) {
			clearInterval(this.#retryTimer);
			this.#retryTimer = null;
		}
	}

	/** Tries to send everything, then counts what is still waiting (e.g. before signing out). */
	async unsentAfterFlush(): Promise<number> {
		await this.flush();
		return db.outbox.count();
	}

	#onEvent(event: OutboxEvent): void {
		if (event.type !== 'withdrawal-recorded' || event.outcome !== 'attached') this.notice = event;
		if (event.type === 'withdrawal-recorded') void this.#refreshPointArea(event.pointId, event.request);
	}

	async #refreshPointArea(pointId: string, request: WithdrawalRequest): Promise<void> {
		const at = (await db.points.get(pointId)) ?? request.location;
		if (!at) return;
		try {
			await pointsSync.refreshAt(at);
		} catch {
			// The next sync of this area picks the change up.
		}
	}
}

export const outbox = new OutboxStore();
