import { liveQuery } from 'dexie';
import { db } from '#lib/data/local/db.js';
import { fetchWithdrawalHistory } from '#lib/data/supabase/history.js';
import type { HistoryEntry } from '#lib/domain/history.js';
import { pullHistory } from '#lib/sync/history-sync.js';
import { session } from './session.svelte.js';

/** Everything the user dialed from Daily, kept on the device so it opens instantly and offline. */
class HistoryStore {
	#all = $state.raw<HistoryEntry[]>([]);
	/** The signed-in user's dials, newest first. */
	entries = $derived(this.#all.filter((entry) => entry.userId === session.user?.id));
	#started = false;

	start(): void {
		if (this.#started) return;
		this.#started = true;
		liveQuery(() => db.history.orderBy('dialedAt').reverse().toArray()).subscribe({
			next: (entries) => (this.#all = entries),
			error: (error) => console.error('Reading the history failed', error)
		});
		window.addEventListener('online', () => void this.pull());
		void this.pull();
	}

	/** Called when the user dials (or copies the code to dial it), never before. */
	async record(entry: Omit<HistoryEntry, 'userId'>): Promise<void> {
		const userId = session.user?.id;
		if (!userId) return;
		await db.history.put({ ...entry, userId });
	}

	/** A new point gets its id once the server has recorded the withdrawal. */
	async attachPoint(id: string, pointId: string): Promise<void> {
		await db.history.update(id, { pointId });
	}

	/** Brings in withdrawals made on other phones (or before this phone kept a history). */
	async pull(): Promise<void> {
		const userId = session.user?.id;
		if (!userId || !navigator.onLine) return;
		try {
			await pullHistory(db, userId, fetchWithdrawalHistory);
		} catch (error) {
			console.warn('Fetching the history failed; showing what is on this phone', error);
		}
	}
}

export const history = new HistoryStore();
