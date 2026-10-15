import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DailyDatabase } from './db.js';
import { TileStore } from './tile-store.js';

const bytes = (size: number) => new ArrayBuffer(size);

let db: DailyDatabase;
let store: TileStore;

beforeEach(() => {
	db = new DailyDatabase(`test-${randomUUID()}`);
	store = new TileStore(db);
});

afterEach(async () => {
	await db.delete();
});

describe('TileStore', () => {
	it('serves recently viewed tiles before and after they are written', async () => {
		store.rememberRecent('14/1/1', bytes(10), 'b1');
		expect((await store.get('14/1/1'))?.data.byteLength).toBe(10);
		await store.flushRecent();
		expect(await db.tiles.get('14/1/1')).toMatchObject({ pinned: 0, areas: [], build: 'b1' });
	});

	it('keeps only the newest recent tiles beyond the limit', async () => {
		for (let i = 0; i < 5; i++) {
			store.rememberRecent(`14/${i}/0`, bytes(1), 'b1');
			await store.flushRecent(3);
			await new Promise((resolve) => setTimeout(resolve, 2));
		}
		expect((await db.tiles.toCollection().primaryKeys()).sort()).toEqual(['14/2/0', '14/3/0', '14/4/0']);
	});

	it('never evicts or overwrites area tiles', async () => {
		await store.pinForArea('home', [{ key: '14/9/9', data: bytes(50) }], 'b1');
		store.rememberRecent('14/9/9', bytes(1), 'b2');
		await store.flushRecent(0);
		expect(await db.tiles.get('14/9/9')).toMatchObject({ pinned: 1, areas: ['home'], build: 'b1' });
	});

	it('keeps tiles shared by two areas until both are released', async () => {
		await store.pinForArea('home', [{ key: 'a', data: bytes(1) }, { key: 'b', data: bytes(1) }], 'b1');
		await store.pinForArea('work', [{ key: 'b', data: bytes(1) }], 'b1');

		await store.releaseArea('home');
		expect(await db.tiles.toCollection().primaryKeys()).toEqual(['b']);
		expect((await db.tiles.get('b'))?.areas).toEqual(['work']);

		await store.releaseArea('work');
		expect(await db.tiles.count()).toBe(0);
	});

	it('reports what an area still needs and how much it holds', async () => {
		await store.pinForArea('home', [{ key: 'a', data: bytes(30) }], 'b1');
		await store.pinForArea('work', [{ key: 'b', data: bytes(1) }], 'b1');

		expect(await store.missingForArea('home', ['a', 'b', 'c'], 'b1')).toEqual(['b', 'c']);
		expect(await store.missingForArea('home', ['a'], 'b2')).toEqual(['a']);
		expect(await store.areaBytes('home')).toEqual({ tiles: 1, bytes: 30 });
	});
});
