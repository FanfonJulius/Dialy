import type { Bounds } from './tiles.ts';

export type LatLng = { lat: number; lng: number };
export type { Bounds };

const EARTH_RADIUS_M = 6_371_008.8;

function toRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
	return (radians * 180) / Math.PI;
}

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
	const dLat = toRadians(b.lat - a.lat);
	const dLng = toRadians(b.lng - a.lng);
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Closed [lng, lat] ring approximating a circle on the ground, e.g. a GPS accuracy halo. */
export function circleRing(center: LatLng, radiusM: number, steps = 48): [number, number][] {
	const angular = radiusM / EARTH_RADIUS_M;
	const lat1 = toRadians(center.lat);
	const lng1 = toRadians(center.lng);
	const ring: [number, number][] = [];
	for (let i = 0; i < steps; i++) {
		const bearing = (2 * Math.PI * i) / steps;
		const lat2 = Math.asin(
			Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
		);
		const lng2 =
			lng1 +
			Math.atan2(
				Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
				Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
			);
		ring.push([toDegrees(lng2), toDegrees(lat2)]);
	}
	ring.push(ring[0]);
	return ring;
}
