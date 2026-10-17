import { describe, expect, it } from 'vitest';
import { distanceMeters } from './geo.ts';
import {
	ARRIVAL_RADIUS_M,
	OFF_ROUTE_M,
	REROUTE_INTERVAL_MS,
	hasArrived,
	parseOsrmRoute,
	pathLength,
	routeProgress,
	shouldReroute,
	type Position
} from './route.ts';

// An L-shaped walk in Yaoundé: about 145 m north, then about 89 m east.
const START: Position = [11.5167, 3.8667];
const CORNER: Position = [11.5167, 3.868];
const END: Position = [11.5175, 3.868];
const PATH = [START, CORNER, END];
const at = ([lng, lat]: Position) => ({ lng, lat });

describe('parseOsrmRoute', () => {
	it('reads the first route of an OSRM response', () => {
		const route = parseOsrmRoute({
			code: 'Ok',
			routes: [{ distance: 234.5, duration: 180, geometry: { type: 'LineString', coordinates: PATH } }]
		});
		expect(route).toEqual({ path: PATH, distanceM: 234.5, durationS: 180 });
	});

	it.each([
		['an error', { code: 'NoRoute', routes: [] }],
		['no routes', { code: 'Ok', routes: [] }],
		['a one-point line', { code: 'Ok', routes: [{ distance: 0, duration: 0, geometry: { type: 'LineString', coordinates: [START] } }] }],
		['not JSON data', 'Too Many Requests']
	])('returns null for %s', (_case, json) => {
		expect(parseOsrmRoute(json)).toBeNull();
	});
});

describe('routeProgress', () => {
	it('keeps the whole route at the start', () => {
		const progress = routeProgress(PATH, at(START));
		expect(progress.ahead).toEqual(PATH);
		expect(progress.remainingM).toBeCloseTo(pathLength(PATH), 5);
		expect(progress.offRouteM).toBeCloseTo(0, 5);
	});

	it('drops the part already walked', () => {
		const halfway: Position = [11.5167, 3.8674];
		const progress = routeProgress(PATH, at(halfway));

		expect(progress.ahead[0][0]).toBeCloseTo(halfway[0], 6);
		expect(progress.ahead[0][1]).toBeCloseTo(halfway[1], 6);
		expect(progress.ahead.slice(1)).toEqual([CORNER, END]);
		expect(progress.remainingM).toBeCloseTo(distanceMeters(at(halfway), at(CORNER)) + distanceMeters(at(CORNER), at(END)), 0);
	});

	it('measures how far the walker strayed from the route', () => {
		// About 22 m west of the first leg.
		const progress = routeProgress(PATH, { lng: 11.5165, lat: 3.8674 });
		expect(progress.offRouteM).toBeGreaterThan(20);
		expect(progress.offRouteM).toBeLessThan(25);
		expect(progress.ahead.slice(1)).toEqual([CORNER, END]);
	});
});

describe('hasArrived', () => {
	it('is true only close to the point', () => {
		expect(hasArrived(at(END), at(END))).toBe(true);
		// About 11 m north of the point.
		expect(hasArrived({ lng: 11.5175, lat: 3.8681 }, at(END))).toBe(true);
		expect(hasArrived(at(CORNER), at(END))).toBe(false);
		expect(ARRIVAL_RADIUS_M).toBeLessThan(distanceMeters(at(CORNER), at(END)));
	});
});

describe('shouldReroute', () => {
	it('asks for a new route only off the route, and not too often', () => {
		expect(shouldReroute(OFF_ROUTE_M + 1, REROUTE_INTERVAL_MS)).toBe(true);
		expect(shouldReroute(OFF_ROUTE_M - 1, REROUTE_INTERVAL_MS)).toBe(false);
		expect(shouldReroute(OFF_ROUTE_M + 1, REROUTE_INTERVAL_MS - 1)).toBe(false);
	});
});
