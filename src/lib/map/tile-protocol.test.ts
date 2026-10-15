import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyDatabase } from '#lib/data/local/db.js';
import { TileStore } from '#lib/data/local/tile-store.js';
import type { TileManifest } from '#lib/domain/tile-manifest.js';
import { createTileProtocol, type FetchTile } from './tile-protocol.js';

const manifest: TileManifest = {
	version: 1,
	build: 'b2',
	attribution: '',
	overview: { file: 'overview.pmtiles', maxZoom: 10 },
	detail: { cellZoom: 8, minZoom: 11, maxZoom: 14, cells: {} }
};

let db: DailyDatabase;
let store: TileStore;

beforeEach(() => {
	db = new DailyDatabase(`test-${randomUUID()}`);
	store = new TileStore(db);
});

afterEach(async () => {
	await db.delete();
});

async function load(fetchTile: FetchTile, url = 'daily-tiles://5/16/15') {
	const protocol = createTileProtocol(manifest, store, fetchTile);
	const { data } = await protocol({ url, type: 'arrayBuffer' }, new AbortController());
	return (data as ArrayBuffer).byteLength;
}

describe('createTileProtocol', () => {
	it('serves offline area tiles without the network', async () => {
		await store.pinForArea('home', [{ key: '5/16/15', data: new ArrayBuffer(7) }], 'b1');
		const fetchTile = vi.fn<FetchTile>();
		expect(await load(fetchTile)).toBe(7);
		expect(fetchTile).not.toHaveBeenCalled();
	});

	it('fetches and remembers tiles it does not have', async () => {
		expect(await load(async () => new ArrayBuffer(9))).toBe(9);
		expect((await store.get('5/16/15'))?.build).toBe('b2');
	});

	it('refreshes recent tiles of an older build, but falls back to them offline', async () => {
		store.rememberRecent('5/16/15', new ArrayBuffer(3), 'b1');
		await store.flushRecent();
		expect(await load(async () => new ArrayBuffer(4))).toBe(4);

		store.rememberRecent('5/16/16', new ArrayBuffer(3), 'b1');
		const offline: FetchTile = async () => {
			throw new TypeError('Failed to fetch');
		};
		expect(await load(offline, 'daily-tiles://5/16/16')).toBe(3);
	});

	it('returns an empty tile outside the published zooms', async () => {
		expect(await load(vi.fn<FetchTile>(), 'daily-tiles://15/1/1')).toBe(0);
	});
});
