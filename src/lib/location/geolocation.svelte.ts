import { isSignificantFix, type Fix } from '#lib/domain/location.js';

export type LocationStatus = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable' | 'unsupported';

const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 };

/** Live position, tracked only while Daily is open and visible (never in the background). */
class GeolocationStore {
	/** Position for rendering: only replaced when it changed enough to be worth a redraw. */
	fix = $state.raw<Fix | null>(null);
	status = $state<LocationStatus>('idle');
	#latest: Fix | null = null;
	#listeners = new Set<(fix: Fix) => void>();
	#watchId: number | null = null;
	#wanted = false;

	/**
	 * The newest position as reported, including ones too similar to redraw. Withdrawals use it: someone
	 * standing in a queue at an agent never "moves", yet their position is as fresh as the last report.
	 */
	get latest(): Fix | null {
		return this.#latest;
	}

	/** Whether a position can still be expected (location not refused or missing on this device). */
	get canLocate(): boolean {
		return this.status !== 'denied' && this.status !== 'unsupported';
	}

	/** Calls `listener` with every position reported from now on; returns the unsubscribe function. */
	onFix(listener: (fix: Fix) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	start(): void {
		if (!('geolocation' in navigator)) {
			this.status = 'unsupported';
			return;
		}
		if (this.#wanted) return;
		this.#wanted = true;
		document.addEventListener('visibilitychange', this.#onVisibilityChange);
		if (document.visibilityState === 'visible') this.#watch();
	}

	stop(): void {
		this.#wanted = false;
		document.removeEventListener('visibilitychange', this.#onVisibilityChange);
		this.#clear();
	}

	/** Asks once, e.g. from onboarding, so the browser shows its permission prompt. */
	request(): Promise<LocationStatus> {
		return new Promise((resolve) => {
			if (!('geolocation' in navigator)) {
				this.status = 'unsupported';
				resolve(this.status);
				return;
			}
			navigator.geolocation.getCurrentPosition(
				(position) => {
					this.#onPosition(position);
					resolve(this.status);
				},
				(error) => {
					this.#onError(error);
					resolve(this.status);
				},
				WATCH_OPTIONS
			);
		});
	}

	#onVisibilityChange = (): void => {
		if (document.visibilityState === 'visible' && this.#wanted) this.#watch();
		else this.#clear();
	};

	/**
	 * Asks for a new position right away (a phone standing still may not report any), e.g. when a dial
	 * finds the last one old or vague. It reaches onFix listeners like any other.
	 */
	refresh(): void {
		if (!('geolocation' in navigator) || !this.canLocate) return;
		navigator.geolocation.getCurrentPosition(this.#onPosition, this.#onError, {
			...WATCH_OPTIONS,
			maximumAge: 0
		});
	}

	#watch(): void {
		if (this.#watchId !== null) return;
		if (this.status !== 'active') this.status = 'locating';
		this.#watchId = navigator.geolocation.watchPosition(this.#onPosition, this.#onError, WATCH_OPTIONS);
	}

	#clear(): void {
		if (this.#watchId !== null) navigator.geolocation.clearWatch(this.#watchId);
		this.#watchId = null;
	}

	#onPosition = (position: GeolocationPosition): void => {
		const next: Fix = {
			lat: position.coords.latitude,
			lng: position.coords.longitude,
			accuracy: position.coords.accuracy,
			timestamp: position.timestamp
		};
		this.#latest = next;
		this.status = 'active';
		if (isSignificantFix(this.fix, next)) this.fix = next;
		for (const listener of this.#listeners) listener(next);
	};

	#onError = (error: GeolocationPositionError): void => {
		if (error.code === error.PERMISSION_DENIED) {
			this.status = 'denied';
			this.#clear();
		} else if (!this.fix) {
			this.status = 'unavailable'; // the watch keeps trying
		}
	};
}

export const geolocation = new GeolocationStore();
