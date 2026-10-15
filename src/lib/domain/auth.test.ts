import { describe, expect, it } from 'vitest';
import { authErrorKey, credentialsIssue, normalizeEmail } from './auth.js';
import { parseStoredSession } from './session.js';

describe('credentialsIssue', () => {
	it.each(['', 'ama', 'ama@', 'ama@mail', 'a b@mail.cm'])('rejects the email %j', (email) => {
		expect(credentialsIssue(email, 'secret123', 'sign-in')).toBe('email_invalid');
	});

	it('only requires a password to sign in', () => {
		expect(credentialsIssue('ama@mail.cm', '', 'sign-in')).toBe('password_required');
		expect(credentialsIssue('ama@mail.cm', 'x', 'sign-in')).toBeNull();
	});

	it('applies the password policy when creating an account', () => {
		expect(credentialsIssue('ama@mail.cm', 'abc12', 'sign-up')).toBe('password_too_short');
		expect(credentialsIssue('ama@mail.cm', 'abcdefgh', 'sign-up')).toBe('password_needs_letter_and_digit');
		expect(credentialsIssue('ama@mail.cm', '12345678', 'sign-up')).toBe('password_needs_letter_and_digit');
		expect(credentialsIssue('ama@mail.cm', `a1${'x'.repeat(71)}`, 'sign-up')).toBe('password_too_long');
		expect(credentialsIssue('ama@mail.cm', 'mango2026', 'sign-up')).toBeNull();
	});

	it('normalises emails', () => {
		expect(normalizeEmail('  Ama@Mail.CM ')).toBe('ama@mail.cm');
	});
});

describe('authErrorKey', () => {
	it.each([
		[{ code: 'invalid_credentials' }, 'invalid_credentials'],
		[{ code: 'user_already_exists' }, 'email_taken'],
		[{ code: 'weak_password' }, 'weak_password'],
		[{ code: 'over_request_rate_limit' }, 'rate_limited'],
		[{ status: 429 }, 'rate_limited'],
		[{ name: 'AuthRetryableFetchError' }, 'offline'],
		[{ code: 'something_new' }, 'unknown'],
		[null, 'unknown']
	] as const)('maps %j to %s', (error, key) => {
		expect(authErrorKey(error)).toBe(key);
	});
});

describe('parseStoredSession', () => {
	it('reads the user from a stored session', () => {
		const raw = JSON.stringify({ refresh_token: 'r', user: { id: 'u1', email: 'ama@mail.cm' } });
		expect(parseStoredSession(raw)).toEqual({ id: 'u1', email: 'ama@mail.cm' });
	});

	it.each([null, '', '{', '[]', JSON.stringify({ user: { id: 'u1' } }), JSON.stringify({ refresh_token: 'r' })])(
		'treats %j as signed out',
		(raw) => {
			expect(parseStoredSession(raw)).toBeNull();
		}
	);
});
