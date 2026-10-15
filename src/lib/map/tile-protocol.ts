import type { AddProtocolAction } from 'maplibre-gl';
import type { TileStore } from '#lib/data/local/tile-store.js';
import { archiveForTile, type TileManifest } from '#lib/domain/tile-manifest.js';

export const TILE_PROTOCOL = 'daily-tiles';
export const TILE_URL_TEMPLATE = `${TILE_PROTOCOL}://{z}/{x}/{y}`;

/** Fetches one tile's bytes from an archive of the build, or null if the archive has no such tile. */
export type FetchTile = (file: string, z: number, x: number, y: number, signal: AbortSignal) => Promise<ArrayBuffer | null>;

const EMPTY_TILE = new ArrayBuffer(0);

/**
 * MapLibre protocol: tiles on the device first (offline areas, recently viewed), then the network.
 * Viewed tiles are kept so places seen once still show offline.
 */
export function createTileProtocol(manifest: TileManifest, store: TileStore, fetchTile: FetchTile): AddProtocolAction {
	return async ({ url }, abortController) => {
		const match = /^daily-tiles:\/\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
		if (!match) throw new Error(`Unexpected tile URL: ${url}`);
		const [z, x, y] = match.slice(1).map(Number);
		const file = archiveForTile(manifest, z, x, y);
		if (!file) return { data: EMPTY_TILE };

		const key = `${z}/${x}/${y}`;
		const stored = await store.get(key);
		// Area tiles are refreshed by updating the area; recent tiles of an older build are fetched again.
		if (stored && (stored.pinned === 1 || stored.build === manifest.build)) return { data: stored.data.slice(0) };

		let data: ArrayBuffer | null;
		try {
			data = await fetchTile(file, z, x, y, abortController.signal);
		} catch (error) {
			if (stored) return { data: stored.data.slice(0) };
			throw error;
		}
		if (!data) return { data: EMPTY_TILE };
		// MapLibre may hand the returned buffer to its worker, so the store keeps its own copy.
		store.rememberRecent(key, data.slice(0), manifest.build);
		return { data };
	};
}
