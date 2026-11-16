import {
	installPlatform,
	parseInstallState,
	shouldOfferInstall,
	type InstallPlatform,
	type InstallState
} from '#lib/domain/install.js';

const STORAGE_KEY = 'daily.install';
/** Coming back from the dialer, the user first sees the map (and the result of the withdrawal). */
const SHOW_DELAY_MS = 700;

/** Chrome's install prompt event (Android browsers), not in TypeScript's DOM types. */
type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function readState(): InstallState {
	try {
		return parseInstallState(localStorage.getItem(STORAGE_KEY));
	} catch {
		return parseInstallState(null); // storage blocked
	}
}

function writeState(state: InstallState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Storage blocked: the offer may simply come back next time.
	}
}

/** Whether Daily already runs as an installed app (Home screen icon), not in a browser tab. */
function isStandalone(): boolean {
	const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
	return (
		navigatorWithStandalone.standalone === true ||
		['standalone', 'fullscreen', 'minimal-ui'].some((mode) => matchMedia(`(display-mode: ${mode})`).matches) ||
		document.referrer.startsWith('android-app://')
	);
}

/** Offers to add Daily to the Home screen right after a dial, when the user has just seen its value. */
class InstallStore {
	open = $state(false);
	platform = $state<InstallPlatform>('other');
	/** The browser handed over its own install prompt (Android Chrome, Edge, Samsung Internet…). */
	canPrompt = $state(false);
	#deferredPrompt: BeforeInstallPromptEvent | null = null;
	#afterDial = false;
	#started = false;

	start(): void {
		if (this.#started) return;
		this.#started = true;
		this.platform = installPlatform(navigator.userAgent, navigator.maxTouchPoints);
		window.addEventListener('beforeinstallprompt', (event) => {
			// Kept for later instead of Chrome's own banner: Daily asks right after a dial.
			event.preventDefault();
			this.#deferredPrompt = event as BeforeInstallPromptEvent;
			this.canPrompt = true;
		});
		window.addEventListener('appinstalled', () => {
			writeState({ ...readState(), installed: true });
			this.#forgetPrompt();
			this.open = false;
		});
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') this.#showAfterDial();
		});
	}

	/** Called when the user dials or copies a code: the offer appears once they are back from the dialer. */
	dialed(): void {
		if (this.#eligible()) this.#afterDial = true;
	}

	/** Shows the browser's install prompt; its answer closes the offer either way. */
	async install(): Promise<void> {
		const prompt = this.#deferredPrompt;
		if (!prompt) return;
		this.#forgetPrompt(); // a prompt can only be shown once
		try {
			await prompt.prompt();
			const { outcome } = await prompt.userChoice;
			if (outcome === 'accepted') {
				writeState({ ...readState(), installed: true });
				this.open = false;
				return;
			}
		} catch (error) {
			console.warn('The install prompt could not be shown', error);
		}
		this.dismiss();
	}

	/** "Not now" or "Got it": the offer rests for a few days. */
	dismiss(): void {
		if (!this.open) return;
		const state = readState();
		writeState({ ...state, dismissedAt: Date.now(), dismissals: state.dismissals + 1 });
		this.open = false;
	}

	#showAfterDial(): void {
		if (!this.#afterDial) return;
		this.#afterDial = false;
		setTimeout(() => {
			if (document.visibilityState === 'visible' && this.#eligible()) this.open = true;
		}, SHOW_DELAY_MS);
	}

	#eligible(): boolean {
		return shouldOfferInstall(readState(), Date.now(), { platform: this.platform, standalone: isStandalone() });
	}

	#forgetPrompt(): void {
		this.#deferredPrompt = null;
		this.canPrompt = false;
	}
}

export const install = new InstallStore();
