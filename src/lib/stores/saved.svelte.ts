import { liveQuery } from 'dexie';
import { db, type SavedPoint } from '#lib/data/local/db.js';
import { fetchSavedPoints } from '#lib/data/supabase/saved.js';
import { pullSaved } from '#lib/sync/saved-sync.js';
import { outbox } from './outbox.svelte.js';

/** The user's saved points, kept on the device so they open instantly and offline. */
class SavedStore {
	entries = $state.raw<SavedPoint[]>([]);
	ids = $derived(new Set(this.entries.map((entry) => entry.pointId)));
	#started = false;

	start(): void {
		if (this.#started) return;
		this.#started = true;
		liveQuery(() => db.saved.toArray()).subscribe({
			next: (entries) => (this.entries = entries.toSorted((a, b) => b.savedAt.localeCompare(a.savedAt))),
			error: (error) => console.error('Reading saved points failed', error)
		});
		window.addEventListener('online', () => void this.pull());
		void this.pull();
	}

	async set(pointId: string, saved: boolean): Promise<void> {
		// Queued first, so a pull running at the same moment keeps this change.
		await outbox.setSaved(pointId, saved);
		if (saved) await db.saved.put({ pointId, savedAt: new Date().toISOString() });
		else await db.saved.delete(pointId);
	}

	/** Brings in points saved on other devices (after this device's own changes are sent). */
	async pull(): Promise<void> {
		if (!navigator.onLine) return;
		try {
			await outbox.flush();
			await pullSaved(db, fetchSavedPoints);
		} catch {
			// Offline or unreachable: keep the list saved on the device.
		}
	}
}

export const saved = new SavedStore();
