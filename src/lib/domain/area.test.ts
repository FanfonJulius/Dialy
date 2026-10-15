import { describe, expect, it } from 'vitest';
import { AVERAGE_TILE_BYTES, COUNTRY_MAX_ZOOM, areaTiles, estimateAreaBytes, tileKey } from './area.js';
import type { TileManifest } from './tile-manifest.js';
import { latToTileY, lngToTileX } from './tiles.js';

const manifest: TileManifest = {
	version: 1,
	build: '20261013',
	attribution: '© OpenStreetMap',
	overview: { file: 'overview.pmtiles', maxZoom: 10 },
	detail: { cellZoom: 8, minZoom: 11, maxZoom: 14, cells: { '134/125': { file: 'cells/134-125.pmtiles', bytes: 1 } } }
};

// Central Douala, inside the z8 cell 134/125.
const douala = { west: 9.68, south: 4.02, east: 9.74, north: 4.08 };

describe('areaTiles', () => {
	const tiles = areaTiles(manifest, douala);
	const zooms = new Set(tiles.map((tile) => tile.z));

	it('covers every zoom from the whole country down to street level', () => {
		expect([...zooms].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
		expect(tiles.filter((tile) => tile.z === COUNTRY_MAX_ZOOM).length).toBeGreaterThan(1);
	});

	it('includes the street-level tile under the area centre once', () => {
		const centre = { z: 14, x: lngToTileX(9.71, 14), y: latToTileY(4.05, 14) };
		expect(tiles.filter((tile) => tileKey(tile) === tileKey(centre))).toHaveLength(1);
		expect(new Set(tiles.map(tileKey)).size).toBe(tiles.length);
	});

	it('skips detail tiles the build has no archive for', () => {
		const outside = { west: 13.0, south: 9.0, east: 13.1, north: 9.1 }; // Garoua: no cell in this manifest
		expect(areaTiles(manifest, outside).some((tile) => tile.z >= 11)).toBe(false);
	});

	it('stays small for a neighbourhood', () => {
		expect(tiles.length).toBeLessThan(300);
	});
});

describe('estimateAreaBytes', () => {
	it('scales with the number of tiles', () => {
		expect(estimateAreaBytes(10)).toBe(10 * AVERAGE_TILE_BYTES);
	});
});
