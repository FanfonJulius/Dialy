// Self-hosted map fonts and sprites (static/map). Fetched with an offline area so labels show offline.
const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
const GLYPH_RANGES = ['0-255', '256-511', '512-767', '768-1023', '8192-8447'];
const SPRITES = ['light', 'light@2x', 'dark', 'dark@2x'];

export const MAP_ASSET_PATHS: readonly string[] = [
	...FONTS.flatMap((font) => GLYPH_RANGES.map((range) => `/map/fonts/${font}/${range}.pbf`)),
	...SPRITES.flatMap((sprite) => [`/map/sprites/v4/${sprite}.json`, `/map/sprites/v4/${sprite}.png`])
];

/** Asks for every map asset once; the service worker keeps what it fetches for offline use. */
export async function prefetchMapAssets(): Promise<void> {
	await Promise.allSettled(MAP_ASSET_PATHS.map((path) => fetch(encodeURI(path))));
}
