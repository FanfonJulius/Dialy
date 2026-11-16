import { supabase } from './client.js';
import { apiError } from './errors.js';
import type { PointsPageRequest } from '#lib/sync/points-sync.js';

/** PostgREST's code for "no such function": the database has not been migrated yet. */
const FUNCTION_NOT_FOUND = 'PGRST202';

// Until the database has points_in_cell (migrations are applied separately from app releases),
// sync by bounding box as before.
let cellQueryAvailable = true;

async function fetchByBounds({ bounds, since, sinceId, limit }: PointsPageRequest): Promise<unknown> {
	const { data, error, status } = await supabase.rpc('points_in_bbox', {
		p_west: bounds.west,
		p_south: bounds.south,
		p_east: bounds.east,
		p_north: bounds.north,
		p_since: since ?? undefined,
		p_since_id: sinceId ?? undefined,
		p_limit: limit
	});
	if (error) throw apiError(error, status);
	return data;
}

/** One page of a sync cell's points changed since the cursor (an indexed lookup on the server). */
export async function fetchPointsPage(request: PointsPageRequest): Promise<unknown> {
	if (!cellQueryAvailable) return fetchByBounds(request);
	const [x, y] = request.cell.split('/').map(Number);
	const { data, error, status } = await supabase.rpc('points_in_cell', {
		p_x: x,
		p_y: y,
		p_since: request.since ?? undefined,
		p_since_id: request.sinceId ?? undefined,
		p_limit: request.limit
	});
	if (error?.code === FUNCTION_NOT_FOUND) {
		cellQueryAvailable = false;
		return fetchByBounds(request);
	}
	if (error) throw apiError(error, status);
	return data;
}

/** Hides a point the signed-in user added; the server refuses anyone else's. Throws the API error. */
export async function deleteMyPoint(pointId: string): Promise<void> {
	const { error, status } = await supabase.rpc('delete_my_point', { p_point_id: pointId });
	if (error) throw apiError(error, status);
}
