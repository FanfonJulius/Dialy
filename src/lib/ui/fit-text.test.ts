import { describe, expect, it } from 'vitest';
import { fittedFontSize } from './fit-text.ts';

describe('fittedFontSize', () => {
	it('keeps the size when the text already fits', () => {
		expect(fittedFontSize({ fontPx: 16, textPx: 300, boxPx: 320, minPx: 11 })).toBeNull();
		expect(fittedFontSize({ fontPx: 16, textPx: 320, boxPx: 320, minPx: 11 })).toBeNull();
	});

	it('shrinks in proportion so the text fits the box', () => {
		expect(fittedFontSize({ fontPx: 16, textPx: 400, boxPx: 300, minPx: 11 })).toBe(12);
		expect(fittedFontSize({ fontPx: 16, textPx: 330, boxPx: 320, minPx: 11 })).toBe(15.5);
	});

	it('never goes below the minimum size', () => {
		expect(fittedFontSize({ fontPx: 16, textPx: 1200, boxPx: 300, minPx: 11 })).toBe(11);
	});

	it('does nothing before the box has a width', () => {
		expect(fittedFontSize({ fontPx: 16, textPx: 400, boxPx: 0, minPx: 11 })).toBeNull();
	});
});
