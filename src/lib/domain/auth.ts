// Mirrors the Supabase Auth password policy (supabase/config.toml and the dashboard).
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
const EMAIL_MAX_LENGTH = 254;

export type AuthMode = 'sign-in' | 'sign-up';

export type CredentialsIssue =
	| 'email_invalid'
	| 'password_required'
	| 'password_too_short'
	| 'password_too_long'
	| 'password_needs_letter_and_digit';

export type AuthErrorKey =
	| 'invalid_credentials'
	| 'email_taken'
	| 'weak_password'
	| 'email_invalid'
	| 'rate_limited'
	| 'signup_disabled'
	| 'offline'
	| 'unknown';

export function normalizeEmail(raw: string): string {
	return raw.trim().toLowerCase();
}

export function credentialsIssue(email: string, password: string, mode: AuthMode): CredentialsIssue | null {
	if (email.length > EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'email_invalid';
	if (password.length === 0) return 'password_required';
	if (mode === 'sign-in') return null;
	if (password.length < PASSWORD_MIN_LENGTH) return 'password_too_short';
	if (password.length > PASSWORD_MAX_LENGTH) return 'password_too_long';
	if (!/[a-z]/i.test(password) || !/\d/.test(password)) return 'password_needs_letter_and_digit';
	return null;
}

type AuthErrorLike = { code?: string; name?: string; status?: number };

const ERROR_CODES: Record<string, AuthErrorKey> = {
	invalid_credentials: 'invalid_credentials',
	user_already_exists: 'email_taken',
	email_exists: 'email_taken',
	weak_password: 'weak_password',
	email_address_invalid: 'email_invalid',
	validation_failed: 'email_invalid',
	over_request_rate_limit: 'rate_limited',
	over_email_send_rate_limit: 'rate_limited',
	signup_disabled: 'signup_disabled',
	email_provider_disabled: 'signup_disabled'
};

export function authErrorKey(error: AuthErrorLike | null | undefined): AuthErrorKey {
	if (!error) return 'unknown';
	if (error.name === 'AuthRetryableFetchError') return 'offline';
	if (error.code && error.code in ERROR_CODES) return ERROR_CODES[error.code];
	if (error.status === 429) return 'rate_limited';
	return 'unknown';
}
