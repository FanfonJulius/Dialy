import { isSignificantFix, type Fix } from '#lib/domain/location.js';

export type LocationStatus = 'idle' | 'locating' | 'active' | 'denied' | 'unavailable' | 'unsupported';

const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 };

/** Live position, tracked only while Daily is open and visible (never in the background). */
class GeolocationStore {
	fix = $state.raw<Fix | null>(null);
	status = $state<LocationStatus>('idle');
	#watchId: number | null = null;
	#wanted = false;

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
		this.status = 'active';
		if (isSignificantFix(this.fix, next)) this.fix = next;
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
