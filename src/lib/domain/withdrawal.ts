import type { Fix } from './location.ts';

/** PostgreSQL `integer`, the type of withdrawals.amount. */
export const MAX_RECORDABLE_AMOUNT = 2_147_483_647;
/** A fix older than this no longer says where the withdrawal happened. */
export const MAX_FIX_AGE_MS = 5 * 60_000;

export type AmountLimits = { minAmount: number; maxAmount: number | null };
export type AmountIssue = 'amount_required' | 'amount_too_low' | 'amount_too_high';
export type CodeIssue = 'code_required' | 'code_invalid';

/** Digits typed by the user as a whole number of francs; spaces and separators are ignored. */
export function parseAmount(raw: string): number | null {
	const digits = raw.replace(/\D/g, '');
	if (digits === '') return null;
	const amount = Number(digits);
	return Number.isSafeInteger(amount) ? amount : Number.MAX_SAFE_INTEGER;
}

export function amountIssue(amount: number | null, limits: AmountLimits): AmountIssue | null {
	if (amount === null || amount === 0) return 'amount_required';
	if (amount < limits.minAmount) return 'amount_too_low';
	const max = Math.min(limits.maxAmount ?? MAX_RECORDABLE_AMOUNT, MAX_RECORDABLE_AMOUNT);
	if (amount > max) return 'amount_too_high';
	return null;
}

/** Checks a code against the network's server-defined format (e.g. `^[0-9]{4,6}$`). */
export function codeIssue(code: string, codePattern: string): CodeIssue | null {
	if (code === '') return 'code_required';
	let pattern: RegExp;
	try {
		pattern = new RegExp(codePattern);
	} catch {
		pattern = /^\d{1,32}$/; // unreadable pattern: the server still validates
	}
	return /^\d+$/.test(code) && pattern.test(code) ? null : 'code_invalid';
}

export type WithdrawalRequest = {
	clientUuid: string;
	network: string;
	code: string;
	amount: number;
	/** ISO time of the dial; offline withdrawals are sent later with this time. */
	capturedAt: string;
	/** Set when the user picked an existing point: the server then never creates a new one. */
	pointId: string | null;
	location: { lat: number; lng: number; accuracyM: number } | null;
};

export type WithdrawalOutcome = 'created' | 'attached' | 'duplicate';

/** The fix to attach to a withdrawal, or null when it is too old to describe where the user is. */
export function withdrawalLocation(fix: Fix | null, now: number): WithdrawalRequest['location'] {
	if (!fix || now - fix.timestamp > MAX_FIX_AGE_MS) return null;
	return { lat: fix.lat, lng: fix.lng, accuracyM: Math.round(fix.accuracy) };
}

// Stable keys raised by record_withdrawal (supabase/migrations/*_withdrawal_functions.sql).
const REJECTIONS = [
	'invalid_request',
	'invalid_network',
	'invalid_code',
	'invalid_amount',
	'invalid_location',
	'stale_event',
	'daily_withdrawal_limit',
	'impossible_jump',
	'point_not_found',
	'point_mismatch',
	'location_required',
	'location_inaccurate',
	'outside_service_area',
	'daily_point_limit',
	'too_close'
] as const;

export type WithdrawalRejection = (typeof REJECTIONS)[number] | 'unknown';

export function withdrawalRejection(message: string | undefined): WithdrawalRejection {
	return REJECTIONS.find((key) => key === message) ?? 'unknown';
}
