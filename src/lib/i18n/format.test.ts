import { describe, expect, it } from 'vitest';
import { formatAmount } from './format.ts';

describe('formatAmount', () => {
	it('formats francs CFA for each language', () => {
		expect(formatAmount(5000, 'en')).toBe('FCFA\u00a05,000');
		expect(formatAmount(100_000, 'fr')).toBe('100\u202f000\u00a0FCFA');
	});
});
