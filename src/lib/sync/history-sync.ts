import type { DailyDatabase } from '#lib/data/local/db.js';
import type { HistoryEntry, ServerWithdrawal } from '#lib/domain/history.js';
import { cellOf } from './points-sync.js';

/** Adds the user's withdrawals known to the server (from any phone) to the history kept on this one. */
export async function pullHistory(
	db: DailyDatabase,
	userId: string,
	fetchHistory: () => Promise<ServerWithdrawal[]>
): Promise<void> {
	const server = await fetchHistory();
	const entries: HistoryEntry[] = server.map((withdrawal) => ({
		id: withdrawal.clientUuid,
		userId,
		kind: 'withdrawal',
		network: withdrawal.point.network,
		code: withdrawal.point.code,
		amount: withdrawal.amount,
		dialedAt: withdrawal.dialedAt,
		pointId: withdrawal.point.id
	}));
	await db.transaction('rw', db.history, db.points, async () => {
		// The points may lie outside the synced areas: keep them so a history entry opens on the map offline.
		const active = server.filter((withdrawal) => withdrawal.active);
		await db.points.bulkPut(active.map(({ point }) => ({ ...point, cell: cellOf(point.lat, point.lng) })));
		await db.history.bulkPut(entries);
	});
}
