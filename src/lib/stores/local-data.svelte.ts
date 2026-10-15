import { liveQuery } from 'dexie';
import { db, type StoredNetwork } from '#lib/data/local/db.js';
import { refreshNetworks } from '#lib/data/supabase/catalog.js';
import { fetchPointsPage } from '#lib/data/supabase/points.js';
import type { CashPoint } from '#lib/domain/points.js';
import { PointsSync } from '#lib/sync/points-sync.js';

export const pointsSync = new PointsSync(db, fetchPointsPage);

/** Points and networks as stored on the device; the UI renders only from here (works offline). */
class LocalDataStore {
	points = $state.raw<CashPoint[]>([]);
	networks = $state.raw<StoredNetwork[]>([]);
	#started = false;

	start(): void {
		if (this.#started) return;
		this.#started = true;
		liveQuery(() => db.points.toArray()).subscribe({
			next: (points) => (this.points = points),
			error: (error) => console.error('Reading saved points failed', error)
		});
		liveQuery(() => db.networks.orderBy('id').toArray()).subscribe({
			next: (networks) => (this.networks = networks.toSorted((a, b) => a.sortOrder - b.sortOrder)),
			error: (error) => console.error('Reading networks failed', error)
		});
	}

	async refreshNetworks(): Promise<void> {
		try {
			await refreshNetworks(db);
		} catch {
			// Offline: keep the networks saved on the device.
		}
	}

	networkName(id: string): string {
		return this.networks.find((network) => network.id === id)?.name ?? id.toUpperCase();
	}
}

export const localData = new LocalDataStore();
