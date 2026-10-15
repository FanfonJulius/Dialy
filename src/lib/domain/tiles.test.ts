import { describe, expect, it } from 'vitest';
import { ancestorTile, latToTileY, lngToTileX, tileBounds, tilesInBounds } from './tiles.js';
import { archiveForTile, isTileManifest, type TileManifest } from './tile-manifest.js';

const DOUALA = { lat: 4.0511, lng: 9.7679 };

describe('tile maths', () => {
	it('finds the tile containing a place', () => {
		expect([lngToTileX(DOUALA.lng, 8), latToTileY(DOUALA.lat, 8)]).toEqual([134, 125]);
	});

	it('returns bounds that contain the place used to find the tile', () => {
		const bounds = tileBounds(12, lngToTileX(DOUALA.lng, 12), latToTileY(DOUALA.lat, 12));
		expect(bounds.west).toBeLessThanOrEqual(DOUALA.lng);
		expect(bounds.east).toBeGreaterThan(DOUALA.lng);
		expect(bounds.south).toBeLessThanOrEqual(DOUALA.lat);
		expect(bounds.north).toBeGreaterThan(DOUALA.lat);
	});

	it('lists every tile overlapping a bounding box', () => {
		const tiles = tilesInBounds({ west: 9.6, south: 3.9, east: 9.9, north: 4.2 }, 12);
		expect(tiles.length).toBe(16);
		expect(new Set(tiles.map(({ x, y }) => `${x}/${y}`)).size).toBe(16);
	});

	it('finds ancestors at lower zooms', () => {
		const x = lngToTileX(DOUALA.lng, 14);
		const y = latToTileY(DOUALA.lat, 14);
		expect(ancestorTile(14, x, y, 8)).toEqual({ x: 134, y: 125 });
		expect(ancestorTile(14, x, y, 14)).toEqual({ x, y });
	});
});

describe('tile manifest', () => {
	const manifest: TileManifest = {
		version: 1,
		build: '20261013',
		attribution: '© OpenStreetMap',
		overview: { file: 'overview.pmtiles', maxZoom: 10 },
		detail: { cellZoom: 8, minZoom: 11, maxZoom: 14, cells: { '134/125': { file: 'z8-134-125.pmtiles', bytes: 1 } } }
	};

	it('routes low zooms to the overview archive', () => {
		expect(archiveForTile(manifest, 0, 0, 0)).toBe('overview.pmtiles');
		expect(archiveForTile(manifest, 10, 534, 501)).toBe('overview.pmtiles');
	});

	it('routes detail zooms to the archive of their cell', () => {
		const x = lngToTileX(DOUALA.lng, 13);
		const y = latToTileY(DOUALA.lat, 13);
		expect(archiveForTile(manifest, 13, x, y)).toBe('z8-134-125.pmtiles');
	});

	it('has no archive outside the covered cells or zooms', () => {
		expect(archiveForTile(manifest, 12, 0, 0)).toBeNull();
		expect(archiveForTile(manifest, 15, 17_000, 16_000)).toBeNull();
	});

	it('validates manifests read from the network', () => {
		expect(isTileManifest(manifest)).toBe(true);
		expect(isTileManifest({ ...manifest, build: '../etc' })).toBe(false);
		expect(isTileManifest({ ...manifest, version: 2 })).toBe(false);
		expect(isTileManifest(null)).toBe(false);
	});
});
