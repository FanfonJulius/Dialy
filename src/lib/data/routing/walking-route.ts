import type { LatLng } from '#lib/domain/geo.js';
import { parseOsrmRoute, type Route } from '#lib/domain/route.js';
import { NetworkError } from '#lib/data/supabase/errors.js';

/**
 * FOSSGIS's free OSRM server on OpenStreetMap data (no key). Its usage policy asks for light use
 * (at most one request per second), credit, and a "fix the map" link wherever routes are shown.
 */
export const ROUTING_ORIGIN = 'https://routing.openstreetmap.de';
const FOOT_ROUTE_URL = `${ROUTING_ORIGIN}/routed-foot/route/v1/foot`;
const TIMEOUT_MS = 10_000;
// About 1 m: plenty for a walking route, and no more of the user's position than needed.
const DECIMALS = 5;

function coordinates(at: LatLng): string {
	return `${at.lng.toFixed(DECIMALS)},${at.lat.toFixed(DECIMALS)}`;
}

/** The walking route between two places. Throws NetworkError when the service cannot be reached in time. */
export async function fetchWalkingRoute(from: LatLng, to: LatLng, signal: AbortSignal): Promise<Route> {
	const url = `${FOOT_ROUTE_URL}/${coordinates(from)};${coordinates(to)}?overview=full&geometries=geojson&steps=false`;
	const request = new AbortController();
	const abort = () => request.abort();
	signal.addEventListener('abort', abort, { once: true });
	const timer = setTimeout(abort, TIMEOUT_MS);
	let response: Response;
	try {
		response = await fetch(url, { signal: request.signal });
	} catch (error) {
		if (signal.aborted) throw error;
		throw new NetworkError(error instanceof Error ? error.message : 'Routing service unreachable');
	} finally {
		clearTimeout(timer);
		signal.removeEventListener('abort', abort);
	}
	const route = response.ok ? parseOsrmRoute(await response.json()) : null;
	if (!route) throw new Error(`No walking route (HTTP ${response.status})`);
	return route;
}
