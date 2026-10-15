import { latToTileY, lngToTileX, tileBounds, tilesInBounds, type Bounds } from '#lib/domain/tiles.js';
import { parsePointsPage } from '#lib/domain/points.js';
import type { DailyDatabase } from '#lib/data/local/db.js';

export const SYNC_CELL_ZOOM = 12;
export const MAX_CELLS_PER_SYNC = 16;
export const CELL_REFRESH_MS = 2 * 60_000;
/** Re-read a short window before the cursor so rows committed slightly out of order are never missed. */
export const CURSOR_OVERLAP_MS = 2 * 60_000;
export const PAGE_SIZE = 500;
const MAX_PAGES_PER_CELL = 20;
const PARALLEL_CELLS = 3;

export type PointsPageRequest = { bounds: Bounds; since: string | null; sinceId: string | null; limit: number };
export type FetchPointsPage = (request: PointsPageRequest) => Promise<unknown>;

export type SyncResult = { status: 'synced'; cells: number; failed: number } | { status: 'area-too-large' };

export function cellOf(lat: number, lng: number): string {
	return `${lngToTileX(lng, SYNC_CELL_ZOOM)}/${latToTileY(lat, SYNC_CELL_ZOOM)}`;
}

export function cellKeysForBounds(bounds: Bounds): string[] {
	return tilesInBounds(bounds, SYNC_CELL_ZOOM).map(({ x, y }) => `${x}/${y}`);
}

function cellBounds(key: string): Bounds {
	const [x, y] = key.split('/').map(Number);
	return tileBounds(SYNC_CELL_ZOOM, x, y);
}

function overlapStart(cursor: string | null): string | null {
	return cursor === null ? null : new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString();
}

/** Pulls every point of one cell changed since its cursor into the local database. */
export async function syncCell(db: DailyDatabase, key: string, fetchPage: FetchPointsPage, now = Date.now()) {
	const existing = await db.cells.get(key);
	const bounds = cellBounds(key);
	let cursor = { updatedAt: existing?.cursorUpdatedAt ?? null, id: existing?.cursorId ?? null };
	let since = overlapStart(cursor.updatedAt);
	let sinceId: string | null = null;

	for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_CELL; pageIndex++) {
		const page = parsePointsPage(await fetchPage({ bounds, since, sinceId, limit: PAGE_SIZE }));
		await db.transaction('rw', db.points, async () => {
			await db.points.bulkPut(page.active.map((point) => ({ ...point, cell: cellOf(point.lat, point.lng) })));
			await db.points.bulkDelete(page.hiddenIds);
		});
		if (page.last) {
			cursor = page.last;
			since = page.last.updatedAt;
			sinceId = page.last.id;
		}
		if (page.received < PAGE_SIZE) break;
	}

	await db.cells.put({ key, cursorUpdatedAt: cursor.updatedAt, cursorId: cursor.id, syncedAt: now });
}

export class PointsSync {
	#inFlight = new Set<string>();
	#db: DailyDatabase;
	#fetchPage: FetchPointsPage;

	constructor(db: DailyDatabase, fetchPage: FetchPointsPage) {
		this.#db = db;
		this.#fetchPage = fetchPage;
	}

	/** Syncs the cells covering `bounds` that are stale; skips areas too large to be useful. */
	async syncArea(bounds: Bounds, now = Date.now()): Promise<SyncResult> {
		const keys = cellKeysForBounds(bounds);
		if (keys.length > MAX_CELLS_PER_SYNC) return { status: 'area-too-large' };

		const known = await this.#db.cells.bulkGet(keys);
		const stale = keys.filter(
			(key, index) => !this.#inFlight.has(key) && now - (known[index]?.syncedAt ?? 0) >= CELL_REFRESH_MS
		);

		let failed = 0;
		for (let i = 0; i < stale.length; i += PARALLEL_CELLS) {
			const batch = stale.slice(i, i + PARALLEL_CELLS);
			const results = await Promise.allSettled(batch.map((key) => this.#syncOne(key, now)));
			failed += results.filter((result) => result.status === 'rejected').length;
		}
		return { status: 'synced', cells: stale.length, failed };
	}

	/** Fetches the latest changes of the cell holding `at` now, e.g. right after a withdrawal there. */
	async refreshAt(at: { lat: number; lng: number }, now = Date.now()): Promise<void> {
		const key = cellOf(at.lat, at.lng);
		if (!this.#inFlight.has(key)) await this.#syncOne(key, now);
	}

	async #syncOne(key: string, now: number): Promise<void> {
		this.#inFlight.add(key);
		try {
			await syncCell(this.#db, key, this.#fetchPage, now);
		} finally {
			this.#inFlight.delete(key);
		}
	}
}
