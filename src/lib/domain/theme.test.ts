import { describe, expect, it } from 'vitest';
import { parseThemePreference, resolveTheme } from './theme.js';

describe('parseThemePreference', () => {
	it.each(['system', 'light', 'dark'] as const)('keeps the valid preference %s', (value) => {
		expect(parseThemePreference(value)).toBe(value);
	});

	it.each([null, undefined, '', 'blue', 42])('falls back to system for %j', (value) => {
		expect(parseThemePreference(value)).toBe('system');
	});
});

describe('resolveTheme', () => {
	it('follows the system setting when the preference is system', () => {
		expect(resolveTheme('system', true)).toBe('dark');
		expect(resolveTheme('system', false)).toBe('light');
	});

	it('lets a manual choice override the system setting', () => {
		expect(resolveTheme('light', true)).toBe('light');
		expect(resolveTheme('dark', false)).toBe('dark');
	});
});
