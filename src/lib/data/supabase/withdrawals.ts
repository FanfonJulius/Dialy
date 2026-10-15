import type { WithdrawalOutcome, WithdrawalRequest } from '#lib/domain/withdrawal.js';
import { supabase } from './client.js';
import { apiError } from './errors.js';

export type RecordedWithdrawal = { pointId: string; outcome: WithdrawalOutcome };

const OUTCOMES: readonly WithdrawalOutcome[] = ['created', 'attached', 'duplicate'];

/** Records a dialed withdrawal; the server creates or reuses the point. Throws the API error. */
export async function recordWithdrawal(request: WithdrawalRequest): Promise<RecordedWithdrawal> {
	const { data, error, status } = await supabase.rpc('record_withdrawal', {
		p_client_uuid: request.clientUuid,
		p_network_id: request.network,
		p_code: request.code,
		p_amount: request.amount,
		p_lat: request.location?.lat,
		p_lng: request.location?.lng,
		p_accuracy_m: request.location?.accuracyM,
		p_captured_at: request.capturedAt,
		p_point_id: request.pointId ?? undefined
	});
	if (error) throw apiError(error, status);
	const outcome = OUTCOMES.find((value) => value === data?.outcome);
	if (!data?.point_id || !outcome) throw new Error('Unexpected record_withdrawal response');
	return { pointId: data.point_id, outcome };
}
