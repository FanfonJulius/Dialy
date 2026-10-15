import { PMTiles } from 'pmtiles';
import type { AddProtocolAction } from 'maplibre-gl';
import { PUBLIC_SUPABASE_URL, PUBLIC_TILES_BASE_URL } from '$app/env/public';
import { archiveForTile, isTileManifest, type TileManifest } from '#lib/domain/tile-manifest.js';

export const TILE_PROTOCOL = 'daily-tiles';
export const TILE_URL_TEMPLATE = `${TILE_PROTOCOL}://{z}/{x}/{y}`;

const TILES_BASE_URL = PUBLIC_TILES_BASE_URL || `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles`;
const MANIFEST_STORAGE_KEY = 'daily.tiles.manifest';
const EMPTY_TILE = new ArrayBuffer(0);

function readCachedManifest(): TileManifest | null {
	try {
		const cached: unknown = JSON.parse(localStorage.getItem(MANIFEST_STORAGE_KEY) ?? 'null');
		return isTileManifest(cached) ? cached : null;
	} catch {
		return null;
	}
}

/** Latest tile manifest, or the last one seen when offline. Null if the map has never loaded. */
export async function loadTileManifest(): Promise<TileManifest | null> {
	try {
		const response = await fetch(`${TILES_BASE_URL}/manifest.json`, { cache: 'no-cache' });
		if (response.ok) {
			const manifest: unknown = await response.json();
			if (isTileManifest(manifest)) {
				localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(manifest));
				return manifest;
			}
		}
	} catch {
		// Offline or unreachable: use the cached manifest below.
	}
	return readCachedManifest();
}

/** MapLibre protocol that reads each z/x/y tile from the archive the manifest assigns it to. */
export function createTileProtocol(manifest: TileManifest): AddProtocolAction {
	const archives = new Map<string, PMTiles>();

	function archive(file: string): PMTiles {
		const url = `${TILES_BASE_URL}/${manifest.build}/${file}`;
		let pmtiles = archives.get(url);
		if (!pmtiles) {
			pmtiles = new PMTiles(url);
			archives.set(url, pmtiles);
		}
		return pmtiles;
	}

	return async ({ url }, abortController) => {
		const match = /^daily-tiles:\/\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
		if (!match) throw new Error(`Unexpected tile URL: ${url}`);
		const [z, x, y] = match.slice(1).map(Number);
		const file = archiveForTile(manifest, z, x, y);
		if (!file) return { data: EMPTY_TILE };
		const tile = await archive(file).getZxy(z, x, y, abortController.signal);
		return { data: tile?.data ?? EMPTY_TILE };
	};
}
