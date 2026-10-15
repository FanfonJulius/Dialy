import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Bounds } from '#lib/domain/geo.js';
import type { CashPoint } from '#lib/domain/points.js';
import type { WithdrawalRequest } from '#lib/domain/withdrawal.js';

export type StoredPoint = CashPoint & {
	/** Sync cell (z12 tile `x/y`) the point belongs to. */
	cell: string;
};

export type SyncCell = {
	key: string;
	/** Exact server values of the newest row seen, used as the delta-sync cursor. */
	cursorUpdatedAt: string | null;
	cursorId: string | null;
	syncedAt: number;
};

export type StoredNetwork = {
	id: string;
	name: string;
	color: string;
	codePattern: string;
	minAmount: number;
	maxAmount: number | null;
	quickAmounts: number[];
	sortOrder: number;
	/** Active withdrawal USSD template, e.g. `*126*16*{code}*{amount}#`; null if none is published. */
	withdrawalTemplate: string | null;
};

export type SavedPoint = { pointId: string; savedAt: string };

type OutboxBase = {
	/** The withdrawal's client UUID, or a random id for save changes. */
	id: string;
	/** Entries are only ever sent for the account that created them. */
	userId: string;
	createdAt: number;
	attempts: number;
};

/** Changes made on the device and not yet confirmed by the server, oldest first. */
export type OutboxEntry =
	| (OutboxBase & { kind: 'withdrawal'; request: WithdrawalRequest })
	| (OutboxBase & { kind: 'saved'; pointId: string; saved: boolean });

/** A basemap tile kept on the device, keyed `z/x/y`. */
export type StoredTile = {
	key: string;
	data: ArrayBuffer;
	/** Tile build it came from; recently viewed tiles from an older build are fetched again online. */
	build: string;
	/** Offline areas using this tile; empty for tiles kept only because they were viewed recently. */
	areas: string[];
	/** 1 while any area uses the tile (IndexedDB cannot index booleans). */
	pinned: 0 | 1;
	storedAt: number;
};

export type OfflineArea = {
	id: string;
	name: string;
	bounds: Bounds;
	build: string;
	createdAt: number;
	updatedAt: number;
	status: 'downloading' | 'ready' | 'incomplete';
	tileCount: number;
	bytes: number;
};

export class DailyDatabase extends Dexie {
	points!: EntityTable<StoredPoint, 'id'>;
	cells!: EntityTable<SyncCell, 'key'>;
	networks!: EntityTable<StoredNetwork, 'id'>;
	saved!: EntityTable<SavedPoint, 'pointId'>;
	// A plain Table: EntityTable's insert type does not keep the entry union apart.
	outbox!: Table<OutboxEntry, string>;
	tiles!: EntityTable<StoredTile, 'key'>;
	areas!: EntityTable<OfflineArea, 'id'>;

	constructor(name = 'daily') {
		super(name);
		this.version(1).stores({
			points: 'id, cell, [network+code]',
			cells: 'key',
			networks: 'id'
		});
		this.version(2)
			.stores({
				saved: 'pointId',
				outbox: 'id, createdAt'
			})
			.upgrade((tx) =>
				tx
					.table<StoredNetwork>('networks')
					.toCollection()
					.modify((network) => {
						network.withdrawalTemplate ??= null;
					})
			);
		this.version(3).stores({
			tiles: 'key, *areas, [pinned+storedAt]',
			areas: 'id, createdAt'
		});
	}
}

export const db = new DailyDatabase();

/** Forgets everything tied to the signed-in account; public points stay cached. */
export async function clearUserData(database: DailyDatabase): Promise<void> {
	await database.transaction('rw', database.saved, database.outbox, async () => {
		await database.saved.clear();
		await database.outbox.clear();
	});
}
