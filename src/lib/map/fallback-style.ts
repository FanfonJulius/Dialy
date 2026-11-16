import type { StyleSpecification } from 'maplibre-gl';
import type { ResolvedTheme } from '#lib/domain/theme.js';

/**
 * OpenFreeMap: free OpenStreetMap vector maps (no key, commercial use allowed).
 * Used online only while Daily's own tiles are not published, so the map is never blank.
 */
export const OPENFREEMAP_ORIGIN = 'https://tiles.openfreemap.org';
const STYLE_NAMES: Record<ResolvedTheme, string> = { light: 'liberty', dark: 'dark' };
// Generous: OpenFreeMap sometimes takes 20 s to answer from Cameroon, and a retry would start over.
// The points already show on a plain map meanwhile.
const TIMEOUT_MS = 30_000;

const loaded = new Map<ResolvedTheme, Promise<StyleSpecification | null>>();

function isStyle(value: unknown): value is StyleSpecification {
	if (typeof value !== 'object' || value === null) return false;
	const style = value as Partial<StyleSpecification>;
	return style.version === 8 && typeof style.sources === 'object' && Array.isArray(style.layers);
}

async function fetchStyle(theme: ResolvedTheme): Promise<StyleSpecification | null> {
	try {
		const response = await fetch(`${OPENFREEMAP_ORIGIN}/styles/${STYLE_NAMES[theme]}`, {
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		const style: unknown = response.ok ? await response.json() : null;
		return isStyle(style) ? style : null;
	} catch {
		return null; // offline or unreachable: the map shows a plain background
	}
}

export function loadFallbackStyle(theme: ResolvedTheme): Promise<StyleSpecification | null> {
	let style = loaded.get(theme);
	if (!style) {
		style = fetchStyle(theme);
		loaded.set(theme, style);
		// A failure is not remembered, so the next try fetches again.
		void style.then((result) => result ?? loaded.delete(theme));
	}
	return style;
}
