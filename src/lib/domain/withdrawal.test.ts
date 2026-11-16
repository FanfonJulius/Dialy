import { describe, expect, it } from 'vitest';
import {
	LOCATION_GRACE_MS,
	MAX_FIX_AGE_MS,
	MAX_POINT_ACCURACY_M,
	MAX_RECORDABLE_AMOUNT,
	amountIssue,
	betterLocation,
	codeIssue,
	needsBetterLocation,
	parseAmount,
	withdrawalLocation,
	withdrawalRejection,
	type WithdrawalRequest
} from './withdrawal.ts';

const LIMITS = { minAmount: 500, maxAmount: null };

describe('parseAmount', () => {
	it.each([
		['5000', 5000],
		['5 000', 5000],
		['5\u202f000', 5000],
		['10,000', 10000],
		['', null],
		['abc', null]
	])('reads %j as %j', (raw, expected) => {
		expect(parseAmount(raw)).toBe(expected);
	});
});

describe('amountIssue', () => {
	it('requires an amount of at least the network minimum', () => {
		expect(amountIssue(null, LIMITS)).toBe('amount_required');
		expect(amountIssue(0, LIMITS)).toBe('amount_required');
		expect(amountIssue(499, LIMITS)).toBe('amount_too_low');
		expect(amountIssue(500, LIMITS)).toBeNull();
	});

	it('has no maximum of its own beyond what can be stored', () => {
		expect(amountIssue(5_000_000, LIMITS)).toBeNull();
		expect(amountIssue(MAX_RECORDABLE_AMOUNT + 1, LIMITS)).toBe('amount_too_high');
	});

	it('applies a maximum when the network sets one', () => {
		expect(amountIssue(500_001, { minAmount: 500, maxAmount: 500_000 })).toBe('amount_too_high');
	});
});

describe('codeIssue', () => {
	const pattern = '^[0-9]{4,6}$';

	it('accepts 4 to 6 digits', () => {
		expect(codeIssue('1234', pattern)).toBeNull();
		expect(codeIssue('123456', pattern)).toBeNull();
	});

	it.each([
		['', 'code_required'],
		['123', 'code_invalid'],
		['1234567', 'code_invalid'],
		['12a4', 'code_invalid']
	])('flags %j as %s', (code, issue) => {
		expect(codeIssue(code, pattern)).toBe(issue);
	});

	it('still requires digits when the pattern cannot be read', () => {
		expect(codeIssue('1234', '^[0-9')).toBeNull();
		expect(codeIssue('12*4', '^[0-9')).toBe('code_invalid');
	});
});

describe('withdrawalLocation', () => {
	const fix = { lat: 4.05, lng: 9.76, accuracy: 12.6, timestamp: 1_000_000 };

	it('uses a recent fix', () => {
		expect(withdrawalLocation(fix, fix.timestamp + 1000)).toEqual({ lat: 4.05, lng: 9.76, accuracyM: 13 });
	});

	it('drops a stale or missing fix', () => {
		expect(withdrawalLocation(fix, fix.timestamp + MAX_FIX_AGE_MS + 1)).toBeNull();
		expect(withdrawalLocation(null, 0)).toBeNull();
	});
});

describe('waiting for a usable position', () => {
	const DIALED_AT = Date.parse('2026-11-16T09:00:00.000Z');

	function request(overrides: Partial<WithdrawalRequest> = {}): WithdrawalRequest {
		return {
			clientUuid: 'c1',
			network: 'mtn',
			code: '12345',
			amount: 5000,
			capturedAt: new Date(DIALED_AT).toISOString(),
			pointId: null,
			location: null,
			...overrides
		};
	}

	function fixAt(offsetMs: number, accuracy: number) {
		return { lat: 4.05, lng: 9.76, accuracy, timestamp: DIALED_AT + offsetMs };
	}

	it('waits when a new point has no position or one too vague to place it', () => {
		expect(needsBetterLocation(request())).toBe(true);
		expect(needsBetterLocation(request({ location: { lat: 4, lng: 9, accuracyM: MAX_POINT_ACCURACY_M + 1 } }))).toBe(
			true
		);
		expect(needsBetterLocation(request({ location: { lat: 4, lng: 9, accuracyM: MAX_POINT_ACCURACY_M } }))).toBe(false);
	});

	it('never waits for a withdrawal at a tapped point (the server knows where it is)', () => {
		expect(needsBetterLocation(request({ pointId: 'p1' }))).toBe(false);
	});

	it('takes the first fix reported after the dial, e.g. when the user is back from the dialer', () => {
		expect(betterLocation(request(), fixAt(45_000, 18.4))).toEqual({ lat: 4.05, lng: 9.76, accuracyM: 18 });
	});

	it('only replaces a position with a more accurate one', () => {
		const vague = request({ location: { lat: 4, lng: 9, accuracyM: 400 } });

		expect(betterLocation(vague, fixAt(5_000, 30))).toEqual({ lat: 4.05, lng: 9.76, accuracyM: 30 });
		expect(betterLocation(vague, fixAt(5_000, 500))).toBeNull();
	});

	it('ignores fixes from outside the grace period, when the user may have walked away', () => {
		expect(betterLocation(request(), fixAt(LOCATION_GRACE_MS + 1, 10))).toBeNull();
		expect(betterLocation(request(), fixAt(-MAX_FIX_AGE_MS - 1, 10))).toBeNull();
	});
});

describe('withdrawalRejection', () => {
	it('maps server messages to known keys', () => {
		expect(withdrawalRejection('location_inaccurate')).toBe('location_inaccurate');
		expect(withdrawalRejection('something new')).toBe('unknown');
		expect(withdrawalRejection(undefined)).toBe('unknown');
	});
});
