import { describe, expect, it } from 'vitest';
import { formatAmount, formatBytes } from './format.ts';

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
