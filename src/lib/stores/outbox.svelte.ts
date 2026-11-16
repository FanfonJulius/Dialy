import { liveQuery } from 'dexie';
import { db } from '#lib/data/local/db.js';
import { deleteMyPoint } from '#lib/data/supabase/points.js';
import { setSavedRemote } from '#lib/data/supabase/saved.js';
import { recordWithdrawal } from '#lib/data/supabase/withdrawals.js';
import type { Fix } from '#lib/domain/location.js';
import type { CashPoint } from '#lib/domain/points.js';
import type { WithdrawalRequest } from '#lib/domain/withdrawal.js';
import { geolocation } from '#lib/location/geolocation.svelte.js';
import { Outbox, type OutboxEvent } from '#lib/sync/outbox.js';
import { cellOf, placeCreatedPoint } from '#lib/sync/points-sync.js';
import { history } from './history.svelte.js';
import { pointsSync } from './local-data.svelte.js';
import { session } from './session.svelte.js';

const RETRY_INTERVAL_MS = 60_000;
/** Positions arrive about every second; waiting withdrawals don't need to look at each one. */
const FIX_OFFER_INTERVAL_MS = 2000;

/** What the notice banner reports: a server result, or a change confirmed on the device. */
export type OutboxNoticeEvent = OutboxEvent | { type: 'point-deleted'; pointId: string };

/** Withdrawals and saved changes waiting for the server; flushed whenever Daily is online. */
class OutboxStore {
	/** Latest result worth telling the user about (a new point, a rejection). */
	notice = $state.raw<OutboxNoticeEvent | null>(null);
	pending = $state(0);
	#outbox = new Outbox(
		db,
		{ withdrawal: recordWithdrawal, saved: setSavedRemote, deletePoint: deleteMyPoint },
		(event) => this.#onEvent(event)
	);
	#started = false;
	#retryTimer: ReturnType<typeof setInterval> | null = null;
	#lastFixOffer = 0;
	#nextFix: Fix | null = null;
	#fixTimer: ReturnType<typeof setTimeout> | null = null;

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
		// A withdrawal dialed before the phone had a good position gets one as soon as it arrives.
		geolocation.onFix((fix) => this.#queueFix(fix));
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

	/** Takes a point the user added off the map for everyone; it disappears from this phone at once. */
	async deletePoint(point: CashPoint): Promise<void> {
		const userId = session.user?.id;
		if (!userId) return;
		await this.#outbox.enqueueDeletePoint(userId, point.id, cellOf(point.lat, point.lng));
		await db.points.delete(point.id);
		this.notice = { type: 'point-deleted', pointId: point.id };
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

	/** At most one look per FIX_OFFER_INTERVAL_MS, always at the newest fix (never dropping the last one). */
	#queueFix(fix: Fix): void {
		this.#nextFix = fix;
		if (this.#fixTimer) return;
		const wait = Math.max(0, this.#lastFixOffer + FIX_OFFER_INTERVAL_MS - Date.now());
		this.#fixTimer = setTimeout(() => {
			this.#fixTimer = null;
			const next = this.#nextFix;
			this.#nextFix = null;
			if (next) void this.#offerFix(next);
		}, wait);
	}

	async #offerFix(fix: Fix): Promise<void> {
		const userId = session.user?.id;
		if (!userId || this.pending === 0) return;
		this.#lastFixOffer = Date.now();
		try {
			if (await this.#outbox.offerFix(userId, fix)) await this.flush();
		} catch (error) {
			console.error('Adding the position to a waiting withdrawal failed', error);
		}
	}

	#onEvent(event: OutboxEvent): void {
		if (event.type !== 'withdrawal-recorded' || event.outcome !== 'attached') this.notice = event;
		if (event.type === 'delete-rejected') {
			void this.#restoreCell(event.cell);
			return;
		}
		if (event.type !== 'withdrawal-recorded') return;
		const created = event.outcome === 'created';
		void history.attachPoint(event.request.clientUuid, event.pointId, created);
		// Already recorded (its first answer was lost, or the same dial was repeated): the server's
		// history says whether that dial added the point, which decides if the user may delete it.
		if (event.outcome === 'duplicate') void history.pull();
		void this.#refreshPointArea(event.pointId, event.request, created);
	}

	async #refreshPointArea(pointId: string, request: WithdrawalRequest, created: boolean): Promise<void> {
		try {
			// The user sees their new point at once; the sync below brings the server's copy.
			if (created) await placeCreatedPoint(db, pointId, request);
			const at = (await db.points.get(pointId)) ?? request.location;
			if (at) await pointsSync.refreshAt(at);
		} catch {
			// The next sync of this area picks the change up.
		}
	}

	/** A deletion the server refused: read the point's cell from scratch so the point comes back. */
	async #restoreCell(cell: string): Promise<void> {
		try {
			await db.cells.delete(cell);
			await pointsSync.refreshCell(cell);
		} catch {
			// The cell has no cursor any more, so its next sync brings the point back.
		}
	}
}

export const outbox = new OutboxStore();
