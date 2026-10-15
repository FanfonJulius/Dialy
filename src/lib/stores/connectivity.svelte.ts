class ConnectivityStore {
	online = $state(true);
	#started = false;

	start(): void {
		if (this.#started) return;
		this.#started = true;
		this.online = navigator.onLine;
		window.addEventListener('online', () => (this.online = true));
		window.addEventListener('offline', () => (this.online = false));
	}
}

export const connectivity = new ConnectivityStore();
