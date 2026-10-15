import type { DailyDatabase } from '#lib/data/local/db.js';
import type { TileData, TileStore } from '#lib/data/local/tile-store.js';
import { areaTiles, tileKey, type TileRef } from '#lib/domain/area.js';
import type { Bounds } from '#lib/domain/geo.js';
import { archiveForTile, type TileManifest } from '#lib/domain/tile-manifest.js';
import type { FetchTile } from '#lib/map/tile-protocol.js';
import { cellKeysForBounds, syncCell, type FetchPointsPage } from './points-sync.js';

const PARALLEL_TILES = 6;
const PARALLEL_CELLS = 3;
const TILE_BATCH = 48;

export type AreaProgress = { done: number; total: number };
export type AreaDownloadResult = { complete: boolean; failedTiles: number; failedCells: number };

export type AreaDownloadDeps = {
	db: DailyDatabase;
	store: TileStore;
	fetchTile: FetchTile;
	fetchPage: FetchPointsPage;
	/** Null when no basemap is published yet: only the points are downloaded then. */
	manifest: TileManifest | null;
};

async function inParallel<T>(items: readonly T[], limit: number, signal: AbortSignal, run: (item: T) => Promise<void>) {
	let next = 0;
	const worker = async () => {
		while (next < items.length && !signal.aborted) await run(items[next++]);
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Downloads the basemap tiles and every cash point of `bounds` for offline use.
 * Tiles already held for this build are skipped, so an interrupted download resumes where it stopped.
 */
export async function downloadArea(
	deps: AreaDownloadDeps,
	areaId: string,
	bounds: Bounds,
	signal: AbortSignal,
	onProgress: (progress: AreaProgress) => void
): Promise<AreaDownloadResult> {
	const { db, store, fetchTile, fetchPage, manifest } = deps;
	const refs = manifest ? areaTiles(manifest, bounds) : [];
	const byKey = new Map(refs.map((ref) => [tileKey(ref), ref]));
	const missing = manifest ? await store.missingForArea(areaId, [...byKey.keys()], manifest.build) : [];
	const cells = cellKeysForBounds(bounds);

	const total = missing.length + cells.length;
	let done = 0;
	let failedTiles = 0;
	let failedCells = 0;
	const tick = () => onProgress({ done: ++done, total });
	onProgress({ done, total });

	let batch: TileData[] = [];
	const save = async () => {
		if (!manifest || batch.length === 0) return;
		const tiles = batch;
		batch = [];
		await store.pinForArea(areaId, tiles, manifest.build);
	};

	await inParallel(missing, PARALLEL_TILES, signal, async (key) => {
		const ref = byKey.get(key) as TileRef;
		const file = manifest ? archiveForTile(manifest, ref.z, ref.x, ref.y) : null;
		try {
			if (!file) throw new Error(`No archive for ${key}`);
			// No data means empty land or sea: keep an empty tile so offline maps do not try the network.
			const data = (await fetchTile(file, ref.z, ref.x, ref.y, signal)) ?? new ArrayBuffer(0);
			batch.push({ key, data });
			if (batch.length >= TILE_BATCH) await save();
		} catch {
			if (!signal.aborted) failedTiles++;
		}
		tick();
	});
	await save();

	await inParallel(cells, PARALLEL_CELLS, signal, async (key) => {
		try {
			await syncCell(db, key, fetchPage);
		} catch {
			if (!signal.aborted) failedCells++;
		}
		tick();
	});

	return { complete: !signal.aborted && failedTiles === 0 && failedCells === 0, failedTiles, failedCells };
}

/** Points of offline areas older than this are refreshed when Daily opens online. */
export const AREA_POINTS_REFRESH_MS = 6 * 60 * 60_000;

/** Brings the cash points of every offline area up to date, oldest cells first. Returns the cells refreshed. */
export async function refreshAreaPoints(
	db: DailyDatabase,
	areas: readonly { bounds: Bounds }[],
	fetchPage: FetchPointsPage,
	now = Date.now()
): Promise<number> {
	const keys = [...new Set(areas.flatMap((area) => cellKeysForBounds(area.bounds)))];
	const cells = await db.cells.bulkGet(keys);
	const stale = keys
		.map((key, index) => ({ key, syncedAt: cells[index]?.syncedAt ?? 0 }))
		.filter((cell) => now - cell.syncedAt >= AREA_POINTS_REFRESH_MS)
		.sort((a, b) => a.syncedAt - b.syncedAt);
	for (const { key } of stale) await syncCell(db, key, fetchPage, now);
	return stale.length;
}
