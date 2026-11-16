import * as v from 'valibot';
import { pointFields, toCashPoint, type CashPoint } from './points.ts';

export type HistoryKind = 'withdrawal' | 'donation';

/** Something the user dialed from Daily; saved at the moment of dialing, never before. */
export type HistoryEntry = {
	/** The dial's client UUID; for a withdrawal it is also the server's `client_uuid`. */
	id: string;
	userId: string;
	kind: HistoryKind;
	network: string;
	/** The agent code of a withdrawal, or Daily's number for a donation. */
	code: string;
	amount: number;
	/** ISO time of the dial. */
	dialedAt: string;
	/** The point withdrawn at; null for donations and until the server places a new point. */
	pointId: string | null;
	/** True when this withdrawal put the point on the map: its author may delete it. */
	createdPoint?: boolean;
};

export type ServerWithdrawal = {
	clientUuid: string;
	amount: number;
	dialedAt: string;
	point: CashPoint;
	/** Hidden points are no longer shown on the map. */
	active: boolean;
	createdPoint: boolean;
};

const WithdrawalRowSchema = v.object({
	client_uuid: v.pipe(v.string(), v.uuid()),
	amount: v.pipe(v.number(), v.integer(), v.minValue(1)),
	captured_at: v.pipe(v.string(), v.isoTimestamp()),
	point_id: v.pipe(v.string(), v.uuid()),
	...pointFields,
	status: v.picklist(['active', 'hidden']),
	// Absent from databases not yet migrated.
	created_point: v.optional(v.boolean(), false)
});

/** Validates a my_withdrawals response; malformed rows are dropped. */
export function parseWithdrawalHistory(rows: unknown): ServerWithdrawal[] {
	if (!Array.isArray(rows)) return [];
	return rows.flatMap((raw) => {
		const result = v.safeParse(WithdrawalRowSchema, raw);
		if (!result.success) return [];
		const row = result.output;
		return [
			{
				clientUuid: row.client_uuid,
				amount: row.amount,
				// Same format as the times saved on the phone, so they sort together.
				dialedAt: new Date(row.captured_at).toISOString(),
				point: toCashPoint(row.point_id, row),
				active: row.status === 'active',
				createdPoint: row.created_point
			}
		];
	});
}

/** Points the user put on the map (and may therefore delete), from their history. */
export function createdPointIds(entries: readonly HistoryEntry[]): Set<string> {
	return new Set(entries.flatMap((entry) => (entry.createdPoint && entry.pointId ? [entry.pointId] : [])));
}

/**
 * The entry to keep when a dial is recorded again under the same id (the user taps Dial again for the
 * same code and amount): it keeps the point the server already gave it and whether that dial added it.
 */
export function redial(entry: HistoryEntry, existing: HistoryEntry | undefined): HistoryEntry {
	if (!existing) return entry;
	return { ...entry, pointId: entry.pointId ?? existing.pointId, createdPoint: existing.createdPoint ?? entry.createdPoint };
}

export type HistoryPoint = {
	key: string;
	pointId: string | null;
	network: string;
	code: string;
	withdrawals: number;
	total: number;
	lastAt: string;
};

/** The points the user withdrew at, most recently used first. */
export function historyPoints(entries: readonly HistoryEntry[]): HistoryPoint[] {
	const byPoint = new Map<string, HistoryPoint>();
	for (const entry of entries) {
		if (entry.kind !== 'withdrawal') continue;
		const key = entry.pointId ?? `${entry.network}:${entry.code}`;
		const known = byPoint.get(key);
		byPoint.set(
			key,
			known
				? {
						...known,
						withdrawals: known.withdrawals + 1,
						total: known.total + entry.amount,
						lastAt: entry.dialedAt > known.lastAt ? entry.dialedAt : known.lastAt
					}
				: {
						key,
						pointId: entry.pointId,
						network: entry.network,
						code: entry.code,
						withdrawals: 1,
						total: entry.amount,
						lastAt: entry.dialedAt
					}
		);
	}
	return [...byPoint.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
