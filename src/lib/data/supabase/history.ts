import { parseWithdrawalHistory, type ServerWithdrawal } from '#lib/domain/history.js';
import { supabase } from './client.js';
import { apiError } from './errors.js';

export async function fetchWithdrawalHistory(): Promise<ServerWithdrawal[]> {
	const { data, error, status } = await supabase.rpc('my_withdrawals');
	if (error) throw apiError(error, status);
	return parseWithdrawalHistory(data);
}
