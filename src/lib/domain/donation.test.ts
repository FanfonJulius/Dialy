import { describe, expect, it } from 'vitest';
import { DONATION_LIMITS, DONATION_NETWORKS, DONATION_TARGETS, donationUssd } from './donation.ts';
import { isValidUssdTemplate } from './ussd.ts';
import { amountIssue } from './withdrawal.ts';

describe('donationUssd', () => {
	it('sends the amount to the Daily number through each network transfer menu', () => {
		expect(donationUssd(DONATION_TARGETS.mtn, 1000)).toBe('*126*9*654571914*1000#');
		expect(donationUssd(DONATION_TARGETS.orange, 2500)).toBe('#150*1*1*691425334*2500#');
	});

	it('refuses amounts that are not positive whole numbers', () => {
		expect(() => donationUssd(DONATION_TARGETS.mtn, 0)).toThrow();
		expect(() => donationUssd(DONATION_TARGETS.orange, 12.5)).toThrow();
	});
});

describe('DONATION_TARGETS', () => {
	it.each(DONATION_NETWORKS)('gives %s a valid template and a Cameroonian mobile number', (network) => {
		const target = DONATION_TARGETS[network];
		expect(isValidUssdTemplate(target.template)).toBe(true);
		expect(target.number).toMatch(/^6\d{8}$/);
	});
});

describe('DONATION_LIMITS', () => {
	it('accepts small donations but not empty or tiny ones', () => {
		expect(amountIssue(null, DONATION_LIMITS)).toBe('amount_required');
		expect(amountIssue(50, DONATION_LIMITS)).toBe('amount_too_low');
		expect(amountIssue(100, DONATION_LIMITS)).toBeNull();
		expect(amountIssue(250_000, DONATION_LIMITS)).toBeNull();
	});
});
