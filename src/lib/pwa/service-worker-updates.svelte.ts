const SKIP_WAITING = 'SKIP_WAITING';

class ServiceWorkerUpdates {
	/** True when a new version is installed and waiting for the user to apply it. */
	available = $state(false);
	#registration: ServiceWorkerRegistration | null = null;
	#applying = false;

	async init(): Promise<void> {
		if (!('serviceWorker' in navigator) || this.#registration) return;
		const registration = await navigator.serviceWorker.ready;
		this.#registration = registration;

		this.#checkWaiting();
		registration.addEventListener('updatefound', () => {
			const installing = registration.installing;
			installing?.addEventListener('statechange', () => {
				if (installing.state === 'installed') this.#checkWaiting();
			});
		});

		// Only reload when the user asked for the update; the first install also fires controllerchange.
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (this.#applying) window.location.reload();
		});

		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') void this.#checkForUpdate();
		});
	}

	apply(): void {
		const waiting = this.#registration?.waiting;
		if (!waiting) return;
		this.#applying = true;
		waiting.postMessage({ type: SKIP_WAITING });
	}

	#checkWaiting(): void {
		this.available = Boolean(this.#registration?.waiting && navigator.serviceWorker.controller);
	}

	async #checkForUpdate(): Promise<void> {
		try {
			await this.#registration?.update();
		} catch {
			// Offline or server unreachable: the browser retries on the next check.
		}
	}
}

export const serviceWorkerUpdates = new ServiceWorkerUpdates();
