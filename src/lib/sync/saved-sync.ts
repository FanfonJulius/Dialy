import type { DailyDatabase, SavedPoint } from '#lib/data/local/db.js';
import type { SavedEntry } from '#lib/domain/points.js';
import { cellOf } from './points-sync.js';

type PendingIntent = { pointId: string; saved: boolean; createdAt: number };

/** The server's saved list with this device's unsent changes applied on top. */
export function mergeSaved(server: readonly SavedEntry[], pending: readonly PendingIntent[]): SavedPoint[] {
	const merged = new Map<string, SavedPoint>(
		server.map((entry) => [entry.point.id, { pointId: entry.point.id, savedAt: entry.savedAt }])
	);
	for (const intent of pending) {
		if (!intent.saved) merged.delete(intent.pointId);
		else if (!merged.has(intent.pointId)) {
			merged.set(intent.pointId, { pointId: intent.pointId, savedAt: new Date(intent.createdAt).toISOString() });
		}
	}
	return [...merged.values()];
}

/** Replaces the local saved list with the server's, keeping changes not yet sent from this device. */
export async function pullSaved(db: DailyDatabase, fetchSaved: () => Promise<SavedEntry[]>): Promise<void> {
	const server = await fetchSaved();
	await db.transaction('rw', db.saved, db.points, db.outbox, async () => {
		const pending = (await db.outbox.toArray()).flatMap((entry) =>
			entry.kind === 'saved' ? [{ pointId: entry.pointId, saved: entry.saved, createdAt: entry.createdAt }] : []
		);
		// Saved points may lie outside the synced areas: keep their details so they show offline.
		await db.points.bulkPut(server.map(({ point }) => ({ ...point, cell: cellOf(point.lat, point.lng) })));
		await db.saved.clear();
		await db.saved.bulkPut(mergeSaved(server, pending));
	});
}
