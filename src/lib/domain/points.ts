import * as v from 'valibot';
import { distanceMeters, type LatLng } from './geo.ts';

export type CashPoint = {
	id: string;
	network: string;
	code: string;
	lat: number;
	lng: number;
	accuracyM: number;
	withdrawalCount: number;
	lastWithdrawalAt: string | null;
	updatedAt: string;
};

const pointFields = {
	network_id: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]{1,31}$/)),
	code: v.pipe(v.string(), v.regex(/^[0-9]{1,32}$/)),
	lat: v.pipe(v.number(), v.minValue(-90), v.maxValue(90)),
	lng: v.pipe(v.number(), v.minValue(-180), v.maxValue(180)),
	accuracy_m: v.pipe(v.number(), v.minValue(0)),
	withdrawal_count: v.pipe(v.number(), v.integer(), v.minValue(0)),
	last_withdrawal_at: v.nullable(v.string()),
	updated_at: v.pipe(v.string(), v.isoTimestamp())
};

const PointRowSchema = v.object({
	id: v.pipe(v.string(), v.uuid()),
	...pointFields,
	status: v.picklist(['active', 'hidden'])
});

const SavedRowSchema = v.object({
	point_id: v.pipe(v.string(), v.uuid()),
	saved_at: v.pipe(v.string(), v.isoTimestamp()),
	...pointFields
});

function toCashPoint(id: string, row: v.InferOutput<v.ObjectSchema<typeof pointFields, undefined>>): CashPoint {
	return {
		id,
		network: row.network_id,
		code: row.code,
		lat: row.lat,
		lng: row.lng,
		accuracyM: row.accuracy_m,
		withdrawalCount: row.withdrawal_count,
		lastWithdrawalAt: row.last_withdrawal_at,
		updatedAt: row.updated_at
	};
}

export type PointsPage = {
	active: CashPoint[];
	hiddenIds: string[];
	/** Sync cursor: the last row of the page, in server order. */
	last: { updatedAt: string; id: string } | null;
	/** Rows received, valid or not (a full page means there may be more). */
	received: number;
	rejected: number;
};

/** Validates a points_in_bbox response; malformed rows are dropped, never stored. */
export function parsePointsPage(rows: unknown): PointsPage {
	const page: PointsPage = { active: [], hiddenIds: [], last: null, received: 0, rejected: 0 };
	if (!Array.isArray(rows)) return page;
	page.received = rows.length;
	for (const raw of rows) {
		const result = v.safeParse(PointRowSchema, raw);
		if (!result.success) {
			page.rejected++;
			continue;
		}
		const row = result.output;
		page.last = { updatedAt: row.updated_at, id: row.id };
		if (row.status === 'hidden') {
			page.hiddenIds.push(row.id);
			continue;
		}
		page.active.push(toCashPoint(row.id, row));
	}
	return page;
}

export type SavedEntry = { point: CashPoint; savedAt: string };

/** Validates a my_saved_points response; malformed rows are dropped. */
export function parseSavedPoints(rows: unknown): SavedEntry[] {
	if (!Array.isArray(rows)) return [];
	return rows.flatMap((raw) => {
		const result = v.safeParse(SavedRowSchema, raw);
		return result.success
			? [{ point: toCashPoint(result.output.point_id, result.output), savedAt: result.output.saved_at }]
			: [];
	});
}

export type PointFilter = { network: string | 'all'; code: string };

export function matchesFilter(point: CashPoint, filter: PointFilter): boolean {
	if (filter.network !== 'all' && point.network !== filter.network) return false;
	return filter.code === '' || point.code.startsWith(filter.code);
}

export type NearbyPoint = { point: CashPoint; distanceM: number };

export function nearestPoints(points: readonly CashPoint[], origin: LatLng, limit: number): NearbyPoint[] {
	return points
		.map((point) => ({ point, distanceM: distanceMeters(origin, point) }))
		.sort((a, b) => a.distanceM - b.distanceM)
		.slice(0, limit);
}
