export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'daily.theme';

/** Browser chrome colour per theme; must match --bg in layout.css and static/theme-init.js. */
export const THEME_COLORS: Readonly<Record<ResolvedTheme, string>> = {
	light: '#f6f5f2',
	dark: '#121212'
};

export function parseThemePreference(value: unknown): ThemePreference {
	return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
		? (value as ThemePreference)
		: 'system';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
	if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
	return preference;
}
