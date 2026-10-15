// Web Mercator tile maths. Imported by the app and by Node scripts, so it has no imports itself.

export type Bounds = { west: number; south: number; east: number; north: number };
export type TileXY = { x: number; y: number };

const MAX_LATITUDE = 85.0511287798066;

function clampIndex(value: number, z: number): number {
	return Math.min(2 ** z - 1, Math.max(0, value));
}

export function lngToTileX(lng: number, z: number): number {
	return clampIndex(Math.floor(((lng + 180) / 360) * 2 ** z), z);
}

export function latToTileY(lat: number, z: number): number {
	const radians = (Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)) * Math.PI) / 180;
	const y = ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** z;
	return clampIndex(Math.floor(y), z);
}

export function tileBounds(z: number, x: number, y: number): Bounds {
	const n = 2 ** z;
	const latitudeOfRow = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
	return {
		west: (x / n) * 360 - 180,
		east: ((x + 1) / n) * 360 - 180,
		north: latitudeOfRow(y),
		south: latitudeOfRow(y + 1)
	};
}

export function tilesInBounds(bounds: Bounds, z: number): TileXY[] {
	const tiles: TileXY[] = [];
	for (let x = lngToTileX(bounds.west, z); x <= lngToTileX(bounds.east, z); x++) {
		for (let y = latToTileY(bounds.north, z); y <= latToTileY(bounds.south, z); y++) {
			tiles.push({ x, y });
		}
	}
	return tiles;
}

/** The tile at `ancestorZ` that contains tile z/x/y (`ancestorZ` <= z). */
export function ancestorTile(z: number, x: number, y: number, ancestorZ: number): TileXY {
	const shift = z - ancestorZ;
	return { x: x >> shift, y: y >> shift };
}
