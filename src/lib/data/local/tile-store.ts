import Dexie from 'dexie';
import { db, type DailyDatabase, type StoredTile } from './db.ts';

/** Recently viewed tiles kept for offline use (about 60 MB); area tiles are not counted. */
export const RECENT_TILE_LIMIT = 3000;
const WRITE_DELAY_MS = 2000;

export type TileData = { key: string; data: ArrayBuffer };

const recentRange = (db: DailyDatabase) =>
	db.tiles.where('[pinned+storedAt]').between([0, Dexie.minKey], [0, Dexie.maxKey]);

/** Basemap tiles kept on the device: those of offline areas, plus a bounded set of recently viewed ones. */
export class TileStore {
	#db: DailyDatabase;
	#pending = new Map<string, StoredTile>();
	#timer: ReturnType<typeof setTimeout> | null = null;

	constructor(db: DailyDatabase) {
		this.#db = db;
	}

	async get(key: string): Promise<StoredTile | undefined> {
		return this.#pending.get(key) ?? (await this.#db.tiles.get(key));
	}

	/** Keeps a tile fetched while browsing; writes are batched to spare the database. */
	rememberRecent(key: string, data: ArrayBuffer, build: string): void {
		this.#pending.set(key, { key, data, build, areas: [], pinned: 0, storedAt: Date.now() });
		this.#timer ??= setTimeout(() => void this.flushRecent(), WRITE_DELAY_MS);
	}

	async flushRecent(limit = RECENT_TILE_LIMIT): Promise<void> {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		const tiles = [...this.#pending.values()];
		this.#pending.clear();
		if (tiles.length > 0) {
			// Tiles already stored (e.g. by an area download) are left as they are.
			await this.#db.tiles.bulkAdd(tiles).catch(Dexie.BulkError, () => {});
		}
		await this.evictRecent(limit);
	}

	async evictRecent(limit = RECENT_TILE_LIMIT): Promise<void> {
		const excess = (await recentRange(this.#db).count()) - limit;
		if (excess <= 0) return;
		const oldest = await recentRange(this.#db).limit(excess).primaryKeys();
		await this.#db.tiles.bulkDelete(oldest);
	}

	/** Stores tiles for an offline area; tiles shared with other areas stay until all release them. */
	async pinForArea(areaId: string, tiles: readonly TileData[], build: string): Promise<void> {
		await this.#db.transaction('rw', this.#db.tiles, async () => {
			const existing = await this.#db.tiles.bulkGet(tiles.map((tile) => tile.key));
			const now = Date.now();
			await this.#db.tiles.bulkPut(
				tiles.map((tile, index) => ({
					key: tile.key,
					data: tile.data,
					build,
					areas: [...new Set([...(existing[index]?.areas ?? []), areaId])],
					pinned: 1 as const,
					storedAt: now
				}))
			);
		});
	}

	/** Which of `keys` this area does not hold yet in `build` (to resume or update a download). */
	async missingForArea(areaId: string, keys: readonly string[], build: string): Promise<string[]> {
		const stored = await this.#db.tiles.bulkGet([...keys]);
		return keys.filter((_, index) => {
			const tile = stored[index];
			return !tile || tile.build !== build || !tile.areas.includes(areaId);
		});
	}

	/** Frees the area's tiles, except those another area still uses. */
	async releaseArea(areaId: string): Promise<void> {
		await this.#db.tiles
			.where('areas')
			.equals(areaId)
			.modify((tile, ref) => {
				const areas = tile.areas.filter((id) => id !== areaId);
				if (areas.length === 0) delete (ref as { value?: StoredTile }).value;
				else tile.areas = areas;
			});
	}

	async areaBytes(areaId: string): Promise<{ tiles: number; bytes: number }> {
		let tiles = 0;
		let bytes = 0;
		await this.#db.tiles
			.where('areas')
			.equals(areaId)
			.each((tile) => {
				tiles++;
				bytes += tile.data.byteLength;
			});
		return { tiles, bytes };
	}
}

/** Shared by the map and area downloads, so batched recent writes are never split across instances. */
export const tileStore = new TileStore(db);
