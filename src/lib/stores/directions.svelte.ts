import { fetchWalkingRoute } from '#lib/data/routing/walking-route.js';
import { NetworkError } from '#lib/data/supabase/errors.js';
import { distanceMeters, type LatLng } from '#lib/domain/geo.js';
import type { CashPoint } from '#lib/domain/points.js';
import {
	REROUTE_INTERVAL_MS,
	hasArrived,
	routeProgress,
	shouldReroute,
	type Position,
	type Route
} from '#lib/domain/route.js';

/** `straight`: no route could be fetched (offline), so a straight line points the way. */
export type DirectionsStatus = 'loading' | 'route' | 'straight' | 'arrived';

function straightLine(from: LatLng, to: LatLng): Position[] {
	return [
		[from.lng, from.lat],
		[to.lng, to.lat]
	];
}

/** Walking directions to one point, drawn on the map and shortened as the user walks. */
class DirectionsStore {
	target = $state.raw<CashPoint | null>(null);
	status = $state<DirectionsStatus | null>(null);
	/** What is still ahead; null while loading and after arrival. */
	path = $state.raw<Position[] | null>(null);
	remainingM = $state<number | null>(null);
	/** Walking time still ahead, known only with a real route. */
	remainingS = $state<number | null>(null);
	/** Changes each time a new route arrives, so the map can frame it once. */
	revision = $state(0);
	#route: Route | null = null;
	#request: AbortController | null = null;
	#lastRequestAt = 0;

	start(target: CashPoint, from: LatLng): void {
		this.stop();
		this.target = target;
		this.status = 'loading';
		void this.#fetch(from);
	}

	stop(): void {
		this.#request?.abort();
		this.#request = null;
		this.#route = null;
		this.target = null;
		this.status = null;
		this.path = null;
		this.remainingM = null;
		this.remainingS = null;
	}

	/** Follows the walker: drops what is behind them, finds a new route if they leave it, ends on arrival. */
	update(at: LatLng): void {
		const target = this.target;
		if (!target || this.status === 'arrived' || this.status === 'loading') return;
		if (hasArrived(at, target)) {
			this.#request?.abort();
			this.#request = null;
			this.#route = null;
			this.status = 'arrived';
			this.path = null;
			this.remainingM = 0;
			this.remainingS = 0;
			return;
		}
		const sinceRequest = Date.now() - this.#lastRequestAt;
		if (!this.#route) {
			this.#showStraight(at, target);
			// Back online: try again for a real route.
			if (sinceRequest >= REROUTE_INTERVAL_MS && navigator.onLine) void this.#fetch(at);
			return;
		}
		const progress = routeProgress(this.#route.path, at);
		this.path = progress.ahead;
		this.remainingM = progress.remainingM;
		this.remainingS =
			this.#route.distanceM > 0 ? (this.#route.durationS * progress.remainingM) / this.#route.distanceM : 0;
		if (shouldReroute(progress.offRouteM, sinceRequest)) void this.#fetch(at);
	}

	#showStraight(at: LatLng, target: LatLng): void {
		this.status = 'straight';
		this.path = straightLine(at, target);
		this.remainingM = distanceMeters(at, target);
		this.remainingS = null;
	}

	async #fetch(from: LatLng): Promise<void> {
		const target = this.target;
		if (!target) return;
		this.#lastRequestAt = Date.now();
		this.#request?.abort();
		const request = new AbortController();
		this.#request = request;
		try {
			const route = await fetchWalkingRoute(from, target, request.signal);
			if (this.#request !== request) return;
			// A new route while walking replaces the old one without moving the map under the user.
			const first = this.status !== 'route';
			this.#route = route;
			this.status = 'route';
			this.update(from);
			if (first) this.revision++;
		} catch (error) {
			if (this.#request !== request) return;
			if (!(error instanceof NetworkError)) console.warn('Walking route unavailable', error);
			if (this.#route) return; // keep following the previous route
			const fresh = this.status === 'loading';
			this.#showStraight(from, target);
			if (fresh) this.revision++;
		} finally {
			if (this.#request === request) this.#request = null;
		}
	}
}

export const directions = new DirectionsStore();
