import { liveQuery } from 'dexie';
import { db, type OfflineArea } from '#lib/data/local/db.js';
import { tileStore } from '#lib/data/local/tile-store.js';
import { fetchPointsPage } from '#lib/data/supabase/points.js';
import { MAX_AREA_TILES, areaTiles, estimateAreaBytes } from '#lib/domain/area.js';
import type { Bounds } from '#lib/domain/geo.js';
import { prefetchMapAssets } from '#lib/map/assets.js';
import { freshTileManifest, loadTileManifest, pmtilesFetcher } from '#lib/map/tile-source.js';
import { downloadArea, refreshAreaPoints, type AreaProgress } from '#lib/sync/area-download.js';

export type AreaEstimate = { tiles: number; bytes: number; tooLarge: boolean };
export type StorageUse = { usage: number; quota: number };

/** Offline areas: map tiles and cash points of chosen places, kept on the phone. */
class AreasStore {
	areas = $state.raw<OfflineArea[]>([]);
	/** The download in progress, if any (one at a time keeps a weak connection usable). */
	active = $state.raw<{ areaId: string; progress: AreaProgress } | null>(null);
	storage = $state.raw<StorageUse | null>(null);
	#controller: AbortController | null = null;
	#started = false;

	start(): void {
		if (this.#started) return;
		this.#started = true;
		liveQuery(() => db.areas.orderBy('createdAt').reverse().toArray()).subscribe({
			next: (areas) => (this.areas = areas),
			error: (error) => console.error('Reading offline areas failed', error)
		});
		window.addEventListener('online', () => void this.refreshPoints());
		void this.refreshPoints();
		void this.measureStorage();
	}

	/** What downloading `bounds` would take, using the map build already known to the app. */
	async estimate(bounds: Bounds): Promise<AreaEstimate> {
		const manifest = await loadTileManifest();
		const tiles = manifest ? areaTiles(manifest, bounds).length : 0;
		return { tiles, bytes: estimateAreaBytes(tiles), tooLarge: tiles > MAX_AREA_TILES };
	}

	async download(name: string, bounds: Bounds): Promise<OfflineArea | undefined> {
		const now = Date.now();
		const area: OfflineArea = {
			id: crypto.randomUUID(),
			name,
			bounds,
			build: '',
			createdAt: now,
			updatedAt: now,
			status: 'downloading',
			tileCount: 0,
			bytes: 0
		};
		await db.areas.add(area);
		await this.#run(area);
		return db.areas.get(area.id);
	}

	/** Downloads what changed since: a newer map build, missing tiles, the latest points. */
	async update(areaId: string): Promise<void> {
		const area = await db.areas.get(areaId);
		if (area) await this.#run(area);
	}

	cancel(): void {
		this.#controller?.abort();
	}

	async remove(areaId: string): Promise<void> {
		if (this.active?.areaId === areaId) this.cancel();
		await db.areas.delete(areaId);
		await tileStore.releaseArea(areaId);
		void this.measureStorage();
	}

	async refreshPoints(): Promise<void> {
		if (!navigator.onLine || this.active) return;
		try {
			await refreshAreaPoints(db, await db.areas.toArray(), fetchPointsPage);
		} catch {
			// Offline or unreachable: the next opening tries again.
		}
	}

	async measureStorage(): Promise<void> {
		const estimate = await navigator.storage?.estimate?.();
		if (estimate?.usage !== undefined && estimate.quota !== undefined) {
			this.storage = { usage: estimate.usage, quota: estimate.quota };
		}
	}

	async #run(area: OfflineArea): Promise<void> {
		if (this.active) return;
		const controller = new AbortController();
		this.#controller = controller;
		this.active = { areaId: area.id, progress: { done: 0, total: 0 } };
		await db.areas.update(area.id, { status: 'downloading' });
		// Ask the browser not to clear offline data when the phone runs low on space.
		void navigator.storage?.persist?.();
		try {
			const manifest = await freshTileManifest();
			void prefetchMapAssets();
			const result = await downloadArea(
				{ db, store: tileStore, fetchTile: manifest ? pmtilesFetcher(manifest) : async () => null, fetchPage: fetchPointsPage, manifest },
				area.id,
				area.bounds,
				controller.signal,
				(progress) => (this.active = { areaId: area.id, progress })
			);
			const { tiles, bytes } = await tileStore.areaBytes(area.id);
			if (await db.areas.get(area.id)) {
				await db.areas.update(area.id, {
					status: result.complete ? 'ready' : 'incomplete',
					build: manifest?.build ?? area.build,
					updatedAt: Date.now(),
					tileCount: tiles,
					bytes
				});
			} else {
				// Deleted while downloading: free what the last batches stored.
				await tileStore.releaseArea(area.id);
			}
		} catch (error) {
			console.error('Downloading the area failed', error);
			await db.areas.update(area.id, { status: 'incomplete' });
		} finally {
			this.#controller = null;
			this.active = null;
			void this.measureStorage();
		}
	}
}

export const areas = new AreasStore();
