import * as v from 'valibot';
import { EARTH_RADIUS_M, distanceMeters, type LatLng } from './geo.ts';

/** `[lng, lat]`, as in GeoJSON. */
export type Position = [number, number];

export type Route = { path: Position[]; distanceM: number; durationS: number };

/** Directions are offered beyond this distance; closer, the point is a few steps away. */
export const DIRECTIONS_MIN_DISTANCE_M = 100;
/** Within this distance of the point the walk is over. */
export const ARRIVAL_RADIUS_M = 25;
/** Further than this from the route, the walker took another way and needs a new route. */
export const OFF_ROUTE_M = 40;
/** The routing service allows light use only, so new routes are asked for at most this often. */
export const REROUTE_INTERVAL_MS = 15_000;

const OsrmResponseSchema = v.object({
	code: v.literal('Ok'),
	routes: v.pipe(
		v.array(
			v.object({
				distance: v.pipe(v.number(), v.minValue(0)),
				duration: v.pipe(v.number(), v.minValue(0)),
				geometry: v.object({
					type: v.literal('LineString'),
					coordinates: v.pipe(v.array(v.tuple([v.number(), v.number()])), v.minLength(2))
				})
			})
		),
		v.minLength(1)
	)
});

/** The first route of an OSRM response (`geometries=geojson`), or null when there is none. */
export function parseOsrmRoute(json: unknown): Route | null {
	const result = v.safeParse(OsrmResponseSchema, json);
	if (!result.success) return null;
	const [route] = result.output.routes;
	return { path: route.geometry.coordinates, distanceM: route.distance, durationS: route.duration };
}

export function pathLength(path: readonly Position[]): number {
	let total = 0;
	for (let i = 1; i < path.length; i++) {
		total += distanceMeters({ lng: path[i - 1][0], lat: path[i - 1][1] }, { lng: path[i][0], lat: path[i][1] });
	}
	return total;
}

export type RouteProgress = {
	/** The rest of the route, from the walker's closest point on it to the end. */
	ahead: Position[];
	remainingM: number;
	/** How far the walker is from the route. */
	offRouteM: number;
};

/** Where the walker is along `path` (at least two positions). */
export function routeProgress(path: readonly Position[], at: LatLng): RouteProgress {
	// Metres east and north of the walker: a flat map is exact enough over the length of a walk.
	const metresPerDegree = (Math.PI / 180) * EARTH_RADIUS_M;
	const east = metresPerDegree * Math.cos((at.lat * Math.PI) / 180);
	const plane = ([lng, lat]: Position) => ({ x: (lng - at.lng) * east, y: (lat - at.lat) * metresPerDegree });

	let best = { index: 0, t: 0, distance: Infinity };
	for (let i = 0; i < path.length - 1; i++) {
		const a = plane(path[i]);
		const b = plane(path[i + 1]);
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const lengthSquared = dx * dx + dy * dy;
		const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(a.x * dx + a.y * dy) / lengthSquared));
		const distance = Math.hypot(a.x + t * dx, a.y + t * dy);
		if (distance < best.distance) best = { index: i, t, distance };
	}

	const from = path[best.index];
	const to = path[best.index + 1];
	const start: Position = [from[0] + (to[0] - from[0]) * best.t, from[1] + (to[1] - from[1]) * best.t];
	const ahead = best.t === 1 ? path.slice(best.index + 1) : [start, ...path.slice(best.index + 1)];
	return { ahead, remainingM: pathLength(ahead), offRouteM: best.distance };
}

export function hasArrived(at: LatLng, destination: LatLng): boolean {
	return distanceMeters(at, destination) <= ARRIVAL_RADIUS_M;
}

export function shouldReroute(offRouteM: number, msSinceLastRequest: number): boolean {
	return offRouteM > OFF_ROUTE_M && msSinceLastRequest >= REROUTE_INTERVAL_MS;
}
