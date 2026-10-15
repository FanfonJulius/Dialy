import { layers, namedFlavor } from '@protomaps/basemaps';
import type { LayerSpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl';
import type { ResolvedTheme } from '#lib/domain/theme.js';

export const BASEMAP_SOURCE = 'protomaps';

export type BasemapTiles = { url: string; maxZoom: number; attribution: string };

type StyleOptions = {
	theme: ResolvedTheme;
	locale: string;
	/** Null when no tile manifest is available yet. */
	tiles: BasemapTiles | null;
	/** Online map used when Daily's own tiles are missing; points then show on top of it. */
	fallback?: StyleSpecification | null;
	overlaySources: Record<string, SourceSpecification>;
	overlayLayers: LayerSpecification[];
};

export function buildStyle({
	theme,
	locale,
	tiles,
	fallback,
	overlaySources,
	overlayLayers
}: StyleOptions): StyleSpecification {
	if (!tiles && fallback) {
		return {
			...fallback,
			sources: { ...fallback.sources, ...overlaySources },
			layers: [...fallback.layers, ...overlayLayers]
		};
	}
	const flavor = namedFlavor(theme);
	// Fonts and sprites are self-hosted in static/map so labels render offline.
	const origin = window.location.origin;
	const basemapLayers: LayerSpecification[] = tiles
		? layers(BASEMAP_SOURCE, flavor, { lang: locale })
		: [{ id: 'background', type: 'background', paint: { 'background-color': flavor.background } }];
	return {
		version: 8,
		glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
		sprite: `${origin}/map/sprites/v4/${theme}`,
		sources: {
			...(tiles && {
				[BASEMAP_SOURCE]: {
					type: 'vector',
					tiles: [tiles.url],
					maxzoom: tiles.maxZoom,
					attribution: tiles.attribution
				}
			}),
			...overlaySources
		},
		layers: [...basemapLayers, ...overlayLayers]
	};
}
