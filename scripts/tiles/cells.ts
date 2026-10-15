import { tileBounds, tilesInBounds, type Bounds, type TileXY } from '../../src/lib/domain/tiles.ts';

export type Position = [lng: number, lat: number];

/** Ray casting; points exactly on an edge may land either way, which the margin makes irrelevant. */
export function pointInRing([x, y]: Position, ring: readonly Position[]): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

function orientation(a: Position, b: Position, c: Position): number {
	return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

export function segmentsIntersect(a: Position, b: Position, c: Position, d: Position): boolean {
	return (
		orientation(a, b, c) !== orientation(a, b, d) && orientation(c, d, a) !== orientation(c, d, b)
	);
}

function boundsCorners({ west, south, east, north }: Bounds): Position[] {
	return [
		[west, south],
		[east, south],
		[east, north],
		[west, north]
	];
}

function inBounds([x, y]: Position, b: Bounds): boolean {
	return x >= b.west && x <= b.east && y >= b.south && y <= b.north;
}

export function boundsIntersectRing(bounds: Bounds, ring: readonly Position[]): boolean {
	const corners = boundsCorners(bounds);
	if (corners.some((corner) => pointInRing(corner, ring))) return true;
	if (ring.some((vertex) => inBounds(vertex, bounds))) return true;
	for (let i = 0; i < 4; i++) {
		const a = corners[i];
		const b = corners[(i + 1) % 4];
		for (let k = 0; k < ring.length - 1; k++) {
			if (segmentsIntersect(a, b, ring[k], ring[k + 1])) return true;
		}
	}
	return false;
}

/**
 * Tiles at zoom `z` touching the ring. `marginDeg` widens each tile so a coarse
 * outline never drops border towns.
 */
export function cellsCoveringRing(ring: readonly Position[], z: number, marginDeg = 0): TileXY[] {
	const lngs = ring.map((p) => p[0]);
	const lats = ring.map((p) => p[1]);
	const box: Bounds = {
		west: Math.min(...lngs) - marginDeg,
		south: Math.min(...lats) - marginDeg,
		east: Math.max(...lngs) + marginDeg,
		north: Math.max(...lats) + marginDeg
	};
	return tilesInBounds(box, z).filter(({ x, y }) => {
		const b = tileBounds(z, x, y);
		const widened = {
			west: b.west - marginDeg,
			south: b.south - marginDeg,
			east: b.east + marginDeg,
			north: b.north + marginDeg
		};
		return boundsIntersectRing(widened, ring);
	});
}
