import { parseSavedPoints, type SavedEntry } from '#lib/domain/points.js';
import { supabase } from './client.js';
import { apiError } from './errors.js';

const UNIQUE_VIOLATION = '23505';

export async function fetchSavedPoints(): Promise<SavedEntry[]> {
	const { data, error } = await supabase.rpc('my_saved_points');
	if (error) throw error;
	return parseSavedPoints(data);
}

/** Applies the user's intent (saved or not), so retries and repeats are harmless. */
export async function setSavedRemote(pointId: string, saved: boolean): Promise<void> {
	const { error, status } = saved
		? await supabase.from('saved_points').insert({ point_id: pointId })
		: await supabase.from('saved_points').delete().eq('point_id', pointId);
	const alreadySaved = error?.code === UNIQUE_VIOLATION;
	if (error && !alreadySaved) throw apiError(error, status);
}
