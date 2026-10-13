import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_COLORS } from '#lib/domain/theme.js';

const css = readFileSync(new URL('../../routes/layout.css', import.meta.url), 'utf8');

function tokens(selector: string): Record<string, string> {
	const start = css.indexOf(`${selector} {`);
	const block = css.slice(start, css.indexOf('}', start));
	return Object.fromEntries(
		[...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([, name, value]) => [name, value])
	);
}

const themes = { light: tokens(':root'), dark: tokens("[data-theme='dark']") };

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}

const WCAG_AA_TEXT = 4.5;
const WCAG_AA_UI = 3;

// [foreground, background, minimum ratio]: every pairing the UI actually uses.
const PAIRS: readonly [string, string, number][] = [
	['fg', 'bg', WCAG_AA_TEXT],
	['fg', 'surface', WCAG_AA_TEXT],
	['fg', 'surface-2', WCAG_AA_TEXT],
	['fg-muted', 'bg', WCAG_AA_TEXT],
	['fg-muted', 'surface', WCAG_AA_TEXT],
	['fg-muted', 'surface-2', WCAG_AA_TEXT],
	['primary-ink', 'bg', WCAG_AA_TEXT],
	['primary-ink', 'surface', WCAG_AA_TEXT],
	['on-primary', 'primary', WCAG_AA_TEXT],
	['danger', 'bg', WCAG_AA_TEXT],
	['danger', 'surface', WCAG_AA_TEXT],
	['success', 'surface', WCAG_AA_TEXT],
	['on-network', 'net-mtn', WCAG_AA_TEXT],
	['on-network', 'net-orange', WCAG_AA_TEXT],
	['location', 'surface', WCAG_AA_UI]
];

describe.each(Object.entries(themes))('%s theme tokens', (theme, values) => {
	it.each(PAIRS)('%s on %s meets %d:1', (foreground, background, minimum) => {
		expect(values[foreground], `--${foreground} missing`).toBeDefined();
		expect(values[background], `--${background} missing`).toBeDefined();
		expect(contrast(values[foreground], values[background])).toBeGreaterThanOrEqual(minimum);
	});

	it('matches the browser chrome colour used before first paint', () => {
		expect(values.bg).toBe(THEME_COLORS[theme as keyof typeof THEME_COLORS]);
	});
});
