import {
	THEME_COLORS,
	THEME_STORAGE_KEY,
	parseThemePreference,
	resolveTheme,
	type ResolvedTheme,
	type ThemePreference
} from '#lib/domain/theme.js';

const DARK_QUERY = '(prefers-color-scheme: dark)';

class ThemeStore {
	preference = $state<ThemePreference>('system');
	resolved = $state<ResolvedTheme>('light');
	#media: MediaQueryList | null = null;

	init(): void {
		if (this.#media) return;
		this.#media = window.matchMedia(DARK_QUERY);
		this.#media.addEventListener('change', () => this.#apply());
		this.preference = parseThemePreference(readStoredPreference());
		this.#apply();
	}

	set(preference: ThemePreference): void {
		this.preference = preference;
		writeStoredPreference(preference);
		this.#apply();
	}

	#apply(): void {
		this.resolved = resolveTheme(this.preference, this.#media?.matches ?? false);
		document.documentElement.dataset.theme = this.resolved;
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', THEME_COLORS[this.resolved]);
	}
}

function readStoredPreference(): string | null {
	try {
		return localStorage.getItem(THEME_STORAGE_KEY);
	} catch {
		return null; // storage blocked (private mode): fall back to the system theme
	}
}

function writeStoredPreference(preference: ThemePreference): void {
	try {
		localStorage.setItem(THEME_STORAGE_KEY, preference);
	} catch {
		// storage blocked: the choice still applies for this session
	}
}

export const theme = new ThemeStore();
