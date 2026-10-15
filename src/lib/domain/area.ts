import { archiveForTile, type TileManifest } from './tile-manifest.ts';
import { tilesInBounds, type Bounds } from './tiles.ts';

export type TileRef = { z: number; x: number; y: number };

/** Cameroon with a small margin: low zooms of the whole country come with every area. */
export const COUNTRY_BOUNDS: Bounds = { west: 8.4, south: 1.6, east: 16.2, north: 13.1 };
export const COUNTRY_MAX_ZOOM = 6;
/** Low zooms cover more than the area itself, so zooming out offline still shows the surroundings. */
const CONTEXT_FACTOR = 1;
/** About 70 km by 70 km at the detail zooms: a whole city, small enough for a phone. */
export const MAX_AREA_TILES = 2500;
/** Measured: Douala street tiles average 15 KB uncompressed; low zooms are larger. */
export const AVERAGE_TILE_BYTES = 20_000;

export function tileKey({ z, x, y }: TileRef): string {
	return `${z}/${x}/${y}`;
}

function widen(bounds: Bounds, factor: number): Bounds {
	const dx = ((bounds.east - bounds.west) * factor) / 2;
	const dy = ((bounds.north - bounds.south) * factor) / 2;
	return { west: bounds.west - dx, south: bounds.south - dy, east: bounds.east + dx, north: bounds.north + dy };
}

/** Every basemap tile needed to use `bounds` offline, at all zooms the build provides. */
export function areaTiles(manifest: TileManifest, bounds: Bounds): TileRef[] {
	const refs = new Map<string, TileRef>();
	const add = (z: number, area: Bounds) => {
		for (const { x, y } of tilesInBounds(area, z)) {
			const ref = { z, x, y };
			if (archiveForTile(manifest, z, x, y)) refs.set(tileKey(ref), ref);
		}
	};
	for (let z = 0; z <= Math.min(COUNTRY_MAX_ZOOM, manifest.overview.maxZoom); z++) add(z, COUNTRY_BOUNDS);
	const context = widen(bounds, CONTEXT_FACTOR);
	for (let z = 0; z <= manifest.overview.maxZoom; z++) add(z, context);
	for (let z = manifest.detail.minZoom; z <= manifest.detail.maxZoom; z++) add(z, bounds);
	return [...refs.values()];
}

export function estimateAreaBytes(tileCount: number): number {
	return tileCount * AVERAGE_TILE_BYTES;
}
