import { ancestorTile } from './tiles.ts';

// The basemap is split so every file fits Supabase's 50 MB free-plan limit:
// one overview archive for low zooms and one detail archive per cell.
export type TileManifest = {
	version: 1;
	/** Folder holding this build's archives, e.g. "20261013". */
	build: string;
	attribution: string;
	overview: { file: string; maxZoom: number };
	detail: {
		cellZoom: number;
		minZoom: number;
		maxZoom: number;
		/** Keyed by `${x}/${y}` of the cell at `cellZoom`. */
		cells: Record<string, { file: string; bytes: number }>;
	};
};

export function cellKey(x: number, y: number): string {
	return `${x}/${y}`;
}

/** File holding tile z/x/y, or null when this build has no data for it. */
export function archiveForTile(manifest: TileManifest, z: number, x: number, y: number): string | null {
	if (z <= manifest.overview.maxZoom) return manifest.overview.file;
	const { cellZoom, minZoom, maxZoom, cells } = manifest.detail;
	if (z < minZoom || z > maxZoom) return null;
	const cell = ancestorTile(z, x, y, cellZoom);
	return cells[cellKey(cell.x, cell.y)]?.file ?? null;
}

export function isTileManifest(value: unknown): value is TileManifest {
	if (typeof value !== 'object' || value === null) return false;
	const manifest = value as Partial<TileManifest>;
	return (
		manifest.version === 1 &&
		typeof manifest.build === 'string' &&
		/^[\w-]+$/.test(manifest.build) &&
		typeof manifest.attribution === 'string' &&
		typeof manifest.overview?.file === 'string' &&
		typeof manifest.overview.maxZoom === 'number' &&
		typeof manifest.detail?.cellZoom === 'number' &&
		typeof manifest.detail.minZoom === 'number' &&
		typeof manifest.detail.maxZoom === 'number' &&
		typeof manifest.detail.cells === 'object' &&
		manifest.detail.cells !== null
	);
}
