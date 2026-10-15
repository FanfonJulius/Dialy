import { PMTiles } from 'pmtiles';
import { PUBLIC_SUPABASE_URL, PUBLIC_TILES_BASE_URL } from '$app/env/public';
import { isTileManifest, type TileManifest } from '#lib/domain/tile-manifest.js';
import type { FetchTile } from './tile-protocol.ts';

const TILES_BASE_URL = PUBLIC_TILES_BASE_URL || `${PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles`;
const MANIFEST_STORAGE_KEY = 'daily.tiles.manifest';
const MANIFEST_TIMEOUT_MS = 8000;

function readCachedManifest(): TileManifest | null {
	try {
		const cached: unknown = JSON.parse(localStorage.getItem(MANIFEST_STORAGE_KEY) ?? 'null');
		return isTileManifest(cached) ? cached : null;
	} catch {
		return null;
	}
}

async function fetchManifest(): Promise<TileManifest | null> {
	try {
		const response = await fetch(`${TILES_BASE_URL}/manifest.json`, {
			cache: 'no-cache',
			signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS)
		});
		if (!response.ok) return null;
		const manifest: unknown = await response.json();
		if (!isTileManifest(manifest)) return null;
		localStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(manifest));
		return manifest;
	} catch {
		return null; // offline, slow or unreachable
	}
}

/**
 * The tile manifest, without waiting on the network when one is already known:
 * the map opens at once from the cached copy and the next opening uses any newer build.
 */
export async function loadTileManifest(): Promise<TileManifest | null> {
	const cached = readCachedManifest();
	if (cached) {
		void fetchManifest();
		return cached;
	}
	return fetchManifest();
}

/** The newest manifest, for downloads that should use the current build. */
export async function freshTileManifest(): Promise<TileManifest | null> {
	return (await fetchManifest()) ?? readCachedManifest();
}

/** Reads single tiles from the build's archives with HTTP range requests. */
export function pmtilesFetcher(manifest: TileManifest): FetchTile {
	const archives = new Map<string, PMTiles>();
	return async (file, z, x, y, signal) => {
		const url = `${TILES_BASE_URL}/${manifest.build}/${file}`;
		let archive = archives.get(url);
		if (!archive) {
			archive = new PMTiles(url);
			archives.set(url, archive);
		}
		const tile = await archive.getZxy(z, x, y, signal);
		return tile?.data ?? null;
	};
}
