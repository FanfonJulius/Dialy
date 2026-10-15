import { supabase } from './client.js';
import type { PointsPageRequest } from '#lib/sync/points-sync.js';

export async function fetchPointsPage({ bounds, since, sinceId, limit }: PointsPageRequest): Promise<unknown> {
	const { data, error } = await supabase.rpc('points_in_bbox', {
		p_west: bounds.west,
		p_south: bounds.south,
		p_east: bounds.east,
		p_north: bounds.north,
		p_since: since ?? undefined,
		p_since_id: sinceId ?? undefined,
		p_limit: limit
	});
	if (error) throw error;
	return data;
}
