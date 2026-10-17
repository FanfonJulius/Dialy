import { describe, expect, it } from 'vitest';
import { formatAmount, formatBytes, formatDateTime, formatDuration, formatPhoneNumber } from './format.ts';

describe('formatDuration', () => {
	it('rounds to whole minutes, never below one', () => {
		expect(formatDuration(180, 'en')).toMatch(/^3 mins?$/);
		expect(formatDuration(20, 'fr')).toBe('1\u00a0min');
		expect(formatDuration(4500, 'en')).toMatch(/^75 mins?$/);
	});
});

describe('formatDateTime', () => {
	it('shows the day and the time', () => {
		expect(formatDateTime('2026-10-17T14:30:00.000Z', 'en')).toMatch(/^17 Oct 2026, \d{2}:30$/);
		expect(formatDateTime('2026-10-17T14:30:00.000Z', 'fr')).toMatch(/^17 oct\. 2026, \d{2}:30$/);
	});
});

describe('formatPhoneNumber', () => {
	it('groups Cameroonian mobile numbers so they are easy to read', () => {
		expect(formatPhoneNumber('654571914')).toBe('654\u00a057\u00a019\u00a014');
	});

	it('leaves other numbers unchanged', () => {
		expect(formatPhoneNumber('8787')).toBe('8787');
	});
});

describe('formatAmount', () => {
	it('formats francs CFA for each language', () => {
		expect(formatAmount(5000, 'en')).toBe('FCFA\u00a05,000');
		expect(formatAmount(100_000, 'fr')).toBe('100\u202f000\u00a0FCFA');
	});
});

describe('formatBytes', () => {
	it('uses kilobytes below a megabyte and megabytes above', () => {
		expect(formatBytes(850_000, 'en')).toBe('850 kB');
		expect(formatBytes(12_500_000, 'en')).toBe('13 MB');
		expect(formatBytes(4_250_000, 'fr')).toMatch(/^4,3\s?Mo$/);
	});
});
