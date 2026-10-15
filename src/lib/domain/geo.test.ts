import { describe, expect, it } from 'vitest';
import { circleRing, distanceMeters } from './geo.js';
import { isSignificantFix, type Fix } from './location.js';

const DOUALA = { lat: 4.0511, lng: 9.7679 };
const YAOUNDE = { lat: 3.848, lng: 11.5021 };

describe('distanceMeters', () => {
	it('measures the distance between Douala and Yaoundé', () => {
		const km = distanceMeters(DOUALA, YAOUNDE) / 1000;
		expect(km).toBeGreaterThan(190);
		expect(km).toBeLessThan(198);
	});

	it('is zero for the same place', () => {
		expect(distanceMeters(DOUALA, DOUALA)).toBe(0);
	});
});

describe('circleRing', () => {
	it('returns a closed ring at the requested radius', () => {
		const ring = circleRing(DOUALA, 50, 16);
		expect(ring).toHaveLength(17);
		expect(ring[16]).toEqual(ring[0]);
		for (const [lng, lat] of ring) {
			expect(distanceMeters(DOUALA, { lat, lng })).toBeCloseTo(50, 0);
		}
	});
});

describe('isSignificantFix', () => {
	const first: Fix = { ...DOUALA, accuracy: 20, timestamp: 0 };

	it('accepts the first fix', () => {
		expect(isSignificantFix(null, first)).toBe(true);
	});

	it('ignores fixes arriving faster than once per second', () => {
		expect(isSignificantFix(first, { ...first, lat: first.lat + 0.001, timestamp: 500 })).toBe(false);
	});

	it('ignores jitter smaller than 3 m with a similar accuracy', () => {
		expect(isSignificantFix(first, { ...first, lat: first.lat + 0.00001, accuracy: 21, timestamp: 2000 })).toBe(false);
	});

	it('accepts real movement or a big accuracy change', () => {
		expect(isSignificantFix(first, { ...first, lat: first.lat + 0.0001, timestamp: 2000 })).toBe(true);
		expect(isSignificantFix(first, { ...first, accuracy: 8, timestamp: 2000 })).toBe(true);
	});
});
