import { liveQuery } from 'dexie';
import { db } from '#lib/data/local/db.js';
import { fetchWithdrawalHistory } from '#lib/data/supabase/history.js';
import { createdPointIds, redial, type HistoryEntry } from '#lib/domain/history.js';
import { whenIdle } from '#lib/pwa/launch.js';
import { pullHistory } from '#lib/sync/history-sync.js';
import { session } from './session.svelte.js';

/** Everything the user dialed from Daily, kept on the device so it opens instantly and offline. */
class HistoryStore {
	#all = $state.raw<HistoryEntry[]>([]);
	/** The signed-in user's dials, newest first. */
	entries = $derived(this.#all.filter((entry) => entry.userId === session.user?.id));
	/** Points the signed-in user put on the map: they may delete them. */
	createdPointIds = $derived(createdPointIds(this.entries));
	#started = false;

	start(): void {
		if (this.#started) return;
		this.#started = true;
		liveQuery(() => db.history.orderBy('dialedAt').reverse().toArray()).subscribe({
			next: (entries) => (this.#all = entries),
			error: (error) => console.error('Reading the history failed', error)
		});
		window.addEventListener('online', () => void this.pull());
		// Not needed for the first screen: wait until the map's own requests are under way.
		whenIdle(() => void this.pull());
	}

	/** Called when the user dials (or copies the code to dial it), never before. */
	async record(entry: Omit<HistoryEntry, 'userId'>): Promise<void> {
		const userId = session.user?.id;
		if (!userId) return;
		await db.transaction('rw', db.history, async () => {
			await db.history.put(redial({ ...entry, userId }, await db.history.get(entry.id)));
		});
	}

	/** A new point gets its id once the server has recorded the withdrawal; only a 'created' result marks it as added. */
	async attachPoint(id: string, pointId: string, createdPoint: boolean): Promise<void> {
		await db.history.update(id, createdPoint ? { pointId, createdPoint } : { pointId });
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
