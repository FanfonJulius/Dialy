<script lang="ts">
	import { onMount } from 'svelte';
	import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature, StyleSpecification } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Bounds, LatLng } from '#lib/domain/geo.js';
	import type { Fix } from '#lib/domain/location.js';
	import type { CashPoint } from '#lib/domain/points.js';
	import type { Position } from '#lib/domain/route.js';
	import type { ResolvedTheme } from '#lib/domain/theme.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { theme } from '#lib/stores/theme.svelte.js';
	import { loadMaplibre } from './maplibre.ts';
	import {
		LAYERS,
		POINTS_SOURCE,
		ROUTE_SOURCE,
		USER_SOURCE,
		overlayLayers,
		overlaySources,
		pointsGeoJson,
		readOverlayColors,
		routeGeoJson,
		selectedFilter,
		userGeoJson,
		type RouteLine
	} from './overlays.ts';
	import { buildStyle, type BasemapTiles } from './style.ts';
	import { loadFallbackStyle } from './fallback-style.ts';
	import { TILE_PROTOCOL, TILE_URL_TEMPLATE, createTileProtocol } from './tile-protocol.ts';
	import { loadTileManifest, pmtilesFetcher } from './tile-source.ts';
	import { zoomGesture } from './zoom-gesture.ts';
	import { tileStore } from '#lib/data/local/tile-store.js';

	type Props = {
		points: readonly CashPoint[];
		fix: Fix | null;
		selectedId: string | null;
		route?: RouteLine | null;
		/** Height in pixels of the panels covering the bottom of the map; map credits stay above them. */
		bottomInset?: number;
		onselect: (id: string | null) => void;
		onmoveend: (bounds: Bounds) => void;
		ondragstart?: () => void;
		/** The user zoomed in or out (pinch, double tap, wheel or keys); not called for moves made by the app. */
		onzoom?: (direction: 'in' | 'out') => void;
	};

	let {
		points,
		fix,
		selectedId,
		route = null,
		bottomInset = 0,
		onselect,
		onmoveend,
		ondragstart,
		onzoom
	}: Props = $props();

	const CAMERA_KEY = 'daily.camera';
	const POINTS_UPDATE_MS = 150;
	const DEFAULT_CAMERA = { lng: 11.5021, lat: 3.848, zoom: 12 }; // Yaoundé
	// Cameroon with a margin, so the map never drifts somewhere the app does not serve.
	const MAX_BOUNDS: [[number, number], [number, number]] = [
		[6.5, 0.5],
		[18.0, 14.0]
	];

	let container: HTMLDivElement;
	let map = $state.raw<MapLibreMap | null>(null);
	let instance: MapLibreMap | null = null;
	let tiles: BasemapTiles | null = null;
	let fallback: StyleSpecification | null = null;
	// A fly requested before the map has loaded (e.g. the first location fix) runs once it loads.
	let pendingFly: { target: LatLng; zoom: number | undefined } | null = null;

	function readCamera(): { lng: number; lat: number; zoom: number } {
		try {
			const saved: unknown = JSON.parse(localStorage.getItem(CAMERA_KEY) ?? 'null');
			if (
				saved &&
				typeof saved === 'object' &&
				'lng' in saved &&
				'lat' in saved &&
				'zoom' in saved &&
				typeof saved.lng === 'number' &&
				typeof saved.lat === 'number' &&
				typeof saved.zoom === 'number'
			) {
				return { lng: saved.lng, lat: saved.lat, zoom: saved.zoom };
			}
		} catch {
			// Corrupt or blocked storage: use the default view.
		}
		return DEFAULT_CAMERA;
	}

	function currentBounds(instance: MapLibreMap): Bounds {
		const b = instance.getBounds();
		return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
	}

	function style() {
		return buildStyle({
			theme: theme.resolved,
			locale: getLocale(),
			tiles,
			fallback,
			overlaySources: overlaySources(pointsGeoJson(points), userGeoJson(fix), routeGeoJson(route)),
			overlayLayers: overlayLayers(readOverlayColors(), selectedId)
		});
	}

	// Without Daily's own tiles, show the online OpenStreetMap map rather than a blank background.
	async function useFallback(forTheme: ResolvedTheme): Promise<void> {
		const loaded = await loadFallbackStyle(forTheme);
		if (!loaded || !instance || tiles || theme.resolved !== forTheme) return;
		fallback = loaded;
		instance.setStyle(style());
	}

	export function flyTo(target: LatLng, zoom?: number): void {
		if (!map) {
			pendingFly = { target, zoom };
			return;
		}
		map.flyTo({ center: [target.lng, target.lat], zoom: zoom ?? Math.max(map.getZoom(), 15), essential: true });
	}

	/** Frames a route, keeping it clear of the panels over the map. */
	export function fitPath(path: readonly Position[], padding: { top: number; bottom: number }): void {
		if (!map || path.length === 0) return;
		const lngs = path.map(([lng]) => lng);
		const lats = path.map(([, lat]) => lat);
		const side = 32;
		map.fitBounds(
			[
				[Math.min(...lngs), Math.min(...lats)],
				[Math.max(...lngs), Math.max(...lats)]
			],
			{ padding: { top: padding.top + side, bottom: padding.bottom + side, left: side, right: side }, maxZoom: 17 }
		);
	}

	onMount(() => {
		let disposed = false;
		let protocolAdded = false;

		void (async () => {
			const [maplibre, manifest] = await Promise.all([loadMaplibre(), loadTileManifest()]);
			if (disposed) return;
			if (manifest) {
				maplibre.addProtocol(TILE_PROTOCOL, createTileProtocol(manifest, tileStore, pmtilesFetcher(manifest)));
				protocolAdded = true;
				tiles = { url: TILE_URL_TEMPLATE, maxZoom: manifest.detail.maxZoom, attribution: manifest.attribution };
			}
			const camera = readCamera();
			instance = new maplibre.Map({
				container,
				style: style(),
				center: [camera.lng, camera.lat],
				zoom: camera.zoom,
				minZoom: 5,
				maxBounds: MAX_BOUNDS,
				dragRotate: false,
				pitchWithRotate: false,
				touchPitch: false,
				attributionControl: false,
				locale: { 'AttributionControl.ToggleAttribution': m.map_attribution_toggle() }
			});
			instance.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-left');
			instance.touchZoomRotate.disableRotation();
			instance.keyboard.disableRotation();

			const clickable = [LAYERS.points, LAYERS.pointLabels, LAYERS.clusters, LAYERS.clusterCount];
			instance.on('click', (event) => {
				const target = instance!;
				const [feature]: MapGeoJSONFeature[] = target.queryRenderedFeatures(event.point, {
					layers: clickable
				});
				if (!feature) {
					onselect(null);
					return;
				}
				const clusterId = feature.properties.cluster_id;
				if (typeof clusterId === 'number' && feature.geometry.type === 'Point') {
					const center = feature.geometry.coordinates as [number, number];
					void target
						.getSource<GeoJSONSource>(POINTS_SOURCE)
						?.getClusterExpansionZoom(clusterId)
						.then((zoom) => target.easeTo({ center, zoom }));
					return;
				}
				const id = feature.properties.id;
				if (typeof id === 'string') onselect(id);
			});
			for (const layer of clickable) {
				instance.on('mouseenter', layer, () => (instance!.getCanvas().style.cursor = 'pointer'));
				instance.on('mouseleave', layer, () => (instance!.getCanvas().style.cursor = ''));
			}
			instance.on('dragstart', () => ondragstart?.());
			// Only zooming done by the user (its events carry the input event) counts, also when it
			// interrupts one of the app's own camera moves.
			let zoomBefore = instance.getZoom();
			let gestureStartZoom: number | null = null;
			instance.on('zoom', (event) => {
				if (event.originalEvent && gestureStartZoom === null) gestureStartZoom = zoomBefore;
				zoomBefore = instance!.getZoom();
			});
			instance.on('zoomend', () => {
				if (gestureStartZoom === null) return;
				const direction = zoomGesture(gestureStartZoom, instance!.getZoom());
				gestureStartZoom = null;
				if (direction) onzoom?.(direction);
			});
			instance.on('moveend', () => {
				const target = instance!;
				const center = target.getCenter();
				try {
					localStorage.setItem(
						CAMERA_KEY,
						JSON.stringify({ lng: center.lng, lat: center.lat, zoom: target.getZoom() })
					);
				} catch {
					// Storage blocked: the view just is not remembered.
				}
				onmoveend(currentBounds(target));
			});
			instance.once('load', () => {
				map = instance;
				onmoveend(currentBounds(instance!));
				if (pendingFly) flyTo(pendingFly.target, pendingFly.zoom);
				pendingFly = null;
			});
			if (!manifest) void useFallback(theme.resolved);
		})();

		return () => {
			disposed = true;
			instance?.remove();
			instance = null;
			map = null;
			if (protocolAdded) void loadMaplibre().then((maplibre) => maplibre.removeProtocol(TILE_PROTOCOL));
		};
	});

	// Theme changes restyle the map in place (locale changes reload the page).
	let styledTheme = theme.resolved;
	$effect(() => {
		const current = theme.resolved;
		if (!map || current === styledTheme) return;
		styledTheme = current;
		if (tiles) map.setStyle(style(), { diff: true });
		else void useFallback(current);
	});

	// Points arrive in bursts (area downloads, sync pages): re-cluster once they settle.
	let pointsTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const data = pointsGeoJson(points);
		const target = map;
		clearTimeout(pointsTimer);
		pointsTimer = setTimeout(() => target?.getSource<GeoJSONSource>(POINTS_SOURCE)?.setData(data), POINTS_UPDATE_MS);
	});

	$effect(() => {
		const data = userGeoJson(fix);
		map?.getSource<GeoJSONSource>(USER_SOURCE)?.setData(data);
	});

	$effect(() => {
		const data = routeGeoJson(route);
		map?.getSource<GeoJSONSource>(ROUTE_SOURCE)?.setData(data);
	});

	$effect(() => {
		const filter = selectedFilter(selectedId);
		map?.setFilter(LAYERS.selected, ['all', ['!', ['has', 'point_count']], filter]);
	});
</script>

<div
	bind:this={container}
	class="map size-full"
	style:--map-bottom-inset="{bottomInset}px"
	role="region"
	aria-label={m.map_label()}
></div>

<style>
	.map :global(.maplibregl-ctrl-bottom-left),
	.map :global(.maplibregl-ctrl-bottom-right) {
		bottom: var(--map-bottom-inset, 0px);
	}
</style>
