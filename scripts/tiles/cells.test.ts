import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { tileBounds } from '../../src/lib/domain/tiles.ts';
import { cellsCoveringRing, pointInRing, segmentsIntersect, type Position } from './cells.ts';

const square: Position[] = [
	[0, 0],
	[10, 0],
	[10, 10],
	[0, 10],
	[0, 0]
];

const cameroon: Position[] = JSON.parse(
	readFileSync(new URL('./cameroon.geojson', import.meta.url), 'utf8')
).geometry.coordinates[0];

function covers(cells: { x: number; y: number }[], z: number, [lng, lat]: Position): boolean {
	return cells.some(({ x, y }) => {
		const b = tileBounds(z, x, y);
		return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
	});
}

describe('pointInRing', () => {
	it('detects inside and outside points', () => {
		expect(pointInRing([5, 5], square)).toBe(true);
		expect(pointInRing([15, 5], square)).toBe(false);
	});
});

describe('segmentsIntersect', () => {
	it('detects crossing and parallel segments', () => {
		expect(segmentsIntersect([0, 0], [2, 2], [0, 2], [2, 0])).toBe(true);
		expect(segmentsIntersect([0, 0], [2, 0], [0, 1], [2, 1])).toBe(false);
	});
});

describe('cellsCoveringRing', () => {
	const cells = cellsCoveringRing(cameroon, 8, 0.1);

	it('covers the main cities of Cameroon', () => {
		const cities: Position[] = [
			[11.5021, 3.848], // Yaoundé
			[9.7043, 4.0511], // Douala
			[14.3159, 10.591], // Maroua
			[13.3958, 9.3014], // Garoua
			[10.4176, 5.4778], // Bafoussam
			[9.2072, 4.1537], // Limbe
			[15.0444, 12.1067] // Kousséri
		];
		for (const city of cities) expect(covers(cells, 8, city), city.join(',')).toBe(true);
	});

	it('skips cells far from the country', () => {
		expect(covers(cells, 8, [3.38, 6.52])).toBe(false); // Lagos
		expect(covers(cells, 8, [18.55, 4.36])).toBe(false); // Bangui
	});

	it('returns no duplicates and a bounded count', () => {
		const keys = new Set(cells.map(({ x, y }) => `${x}/${y}`));
		expect(keys.size).toBe(cells.length);
		expect(cells.length).toBeGreaterThan(20);
		expect(cells.length).toBeLessThan(80);
	});
});
