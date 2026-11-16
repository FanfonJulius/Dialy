<script lang="ts">
	import { onMount } from 'svelte';
	import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature, StyleSpecification } from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Bounds, LatLng } from '#lib/domain/geo.js';
	import type { Fix } from '#lib/domain/location.js';
	import type { CashPoint } from '#lib/domain/points.js';
	import type { Position } from '#lib/domain/route.js';
	import type { ResolvedTheme } from '#lib/domain/theme.js';
	import type { TileManifest } from '#lib/domain/tile-manifest.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { theme } from '#lib/stores/theme.svelte.js';
	import { loadMaplibre, type MapLibre } from './maplibre.ts';
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
	import { cachedTileManifest, loadTileManifest, pmtilesFetcher } from './tile-source.ts';
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
	// Waits before trying the online map again after a failure (offline, weak signal).
	const FALLBACK_RETRY_MS = [2_000, 5_000, 10_000, 30_000];
	const DEFAULT_CAMERA = { lng: 11.5021, lat: 3.848, zoom: 12 }; // Yaoundé
	// Cameroon with a margin, so the map never drifts somewhere the app does not serve.
	const MAX_BOUNDS: [[number, number], [number, number]] = [
		[6.5, 0.5],
		[18.0, 14.0]
	];

	let container: HTMLDivElement;
	let map = $state.raw<MapLibreMap | null>(null);
	let instance: MapLibreMap | null = null;
	let protocolAdded = false;
	let tiles: BasemapTiles | null = null;
	let fallback: { theme: ResolvedTheme; style: StyleSpecification } | null = null;
	let fallbackRetry: ReturnType<typeof setTimeout> | undefined;
	let fallbackFailures = 0;
	// The theme the map was last styled for.
	let styledTheme: ResolvedTheme | null = null;
	// A move requested before the map has loaded (e.g. the first location fix), made without animation.
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

	// Where the map opens: a place asked for before it existed (e.g. the first location fix), else where it was left.
	function startCamera(): { lng: number; lat: number; zoom: number } {
		const saved = readCamera();
		if (!pendingFly) return saved;
		const { target, zoom } = pendingFly;
		pendingFly = null;
		return { lng: target.lng, lat: target.lat, zoom: zoom ?? Math.max(saved.zoom, 15) };
	}

	function moveTo(target: MapLibreMap, place: LatLng, zoom: number | undefined, animate: boolean): void {
		const center: [number, number] = [place.lng, place.lat];
		const camera = { center, zoom: zoom ?? Math.max(target.getZoom(), 15) };
		// A flight to somewhere off screen would download the map all along the way: jump there instead.
		if (animate && target.getBounds().contains(center)) target.flyTo({ ...camera, essential: true });
		else target.jumpTo(camera);
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
			fallback: fallback?.style,
			overlaySources: overlaySources(pointsGeoJson(points), userGeoJson(fix), routeGeoJson(route)),
			overlayLayers: overlayLayers(readOverlayColors(), selectedId)
		});
	}

	// Swaps the basemap under the points, in place so they never blink. Waits for the map's first load:
	// a swap before it would hold that back (and the camera and points waiting on it) until the new
	// basemap's tiles arrive.
	function restyle(): void {
		const target = instance;
		if (!target) return;
		if (map) target.setStyle(style(), { diff: true });
		else target.once('load', () => target.setStyle(style(), { diff: true }));
	}

	function useOwnTiles(maplibre: MapLibre, manifest: TileManifest): void {
		maplibre.addProtocol(TILE_PROTOCOL, createTileProtocol(manifest, tileStore, pmtilesFetcher(manifest)));
		protocolAdded = true;
		tiles = { url: TILE_URL_TEMPLATE, maxZoom: manifest.detail.maxZoom, attribution: manifest.attribution };
	}

	// Without Daily's own tiles, show the online OpenStreetMap map rather than a blank background,
	// and keep trying after a failure so the map does not stay blank until Daily is reopened.
	async function useFallback(forTheme: ResolvedTheme): Promise<void> {
		clearTimeout(fallbackRetry);
		const loaded = await loadFallbackStyle(forTheme);
		if (!instance || tiles || theme.resolved !== forTheme) return;
		if (!loaded) {
			const delay = FALLBACK_RETRY_MS[Math.min(fallbackFailures++, FALLBACK_RETRY_MS.length - 1)];
			clearTimeout(fallbackRetry);
			fallbackRetry = setTimeout(() => void useFallback(forTheme), delay);
			return;
		}
		fallbackFailures = 0;
		if (fallback?.style === loaded) return;
		fallback = { theme: forTheme, style: loaded };
		restyle();
	}

	// Back online or back in the app: a missing online map is fetched now, not at the next retry.
	function retryFallbackNow(): void {
		if (document.visibilityState !== 'visible' || !instance || tiles) return;
		if (fallback?.theme !== theme.resolved) void useFallback(theme.resolved);
	}

	export function flyTo(target: LatLng, zoom?: number): void {
		if (!map) {
			pendingFly = { target, zoom };
			return;
		}
		moveTo(map, target, zoom, true);
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

	function createMap(maplibre: MapLibre): MapLibreMap {
		const camera = startCamera();
		styledTheme = theme.resolved;
		const created = new maplibre.Map({
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
		created.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-left');
		created.touchZoomRotate.disableRotation();
		created.keyboard.disableRotation();
		listenForSelection(created);
		listenForCamera(created);
		return created;
	}

	function listenForSelection(target: MapLibreMap): void {
		const clickable = [LAYERS.points, LAYERS.pointLabels, LAYERS.clusters, LAYERS.clusterCount];
		target.on('click', (event) => {
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
			target.on('mouseenter', layer, () => (target.getCanvas().style.cursor = 'pointer'));
			target.on('mouseleave', layer, () => (target.getCanvas().style.cursor = ''));
		}
	}

	function listenForCamera(target: MapLibreMap): void {
		target.on('dragstart', () => ondragstart?.());
		// Only zooming done by the user (its events carry the input event) counts, also when it
		// interrupts one of the app's own camera moves.
		let zoomBefore = target.getZoom();
		let gestureStartZoom: number | null = null;
		target.on('zoom', (event) => {
			if (event.originalEvent && gestureStartZoom === null) gestureStartZoom = zoomBefore;
			zoomBefore = target.getZoom();
		});
		target.on('zoomend', () => {
			if (gestureStartZoom === null) return;
			const direction = zoomGesture(gestureStartZoom, target.getZoom());
			gestureStartZoom = null;
			if (direction) onzoom?.(direction);
		});
		target.on('moveend', () => {
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
		target.once('load', () => {
			map = target;
			// Nothing worth animating has been shown yet; the jump reports its view through 'moveend'.
			if (pendingFly) moveTo(target, pendingFly.target, pendingFly.zoom, false);
			else onmoveend(currentBounds(target));
			pendingFly = null;
		});
	}

	onMount(() => {
		let disposed = false;

		void (async () => {
			const cached = cachedTileManifest();
			// Also checks for a newer build in the background when one is cached.
			const check = loadTileManifest();
			// Without Daily's own tiles, the online map is fetched alongside MapLibre, not after it.
			if (!cached) void loadFallbackStyle(theme.resolved);
			const maplibre = await loadMaplibre();
			if (disposed) return;
			if (cached) useOwnTiles(maplibre, cached);
			// The points show at once, on a plain background until the basemap arrives.
			instance = createMap(maplibre);
			if (tiles) return;
			window.addEventListener('online', retryFallbackNow);
			document.addEventListener('visibilitychange', retryFallbackNow);
			// Without waiting for the answer about Daily's own tiles (seconds on a weak signal); if they
			// turn out to be published, they replace the online map.
			void useFallback(theme.resolved);
			const manifest = await check;
			if (disposed || tiles || !manifest) return;
			useOwnTiles(maplibre, manifest);
			restyle();
		})();

		return () => {
			disposed = true;
			clearTimeout(fallbackRetry);
			window.removeEventListener('online', retryFallbackNow);
			document.removeEventListener('visibilitychange', retryFallbackNow);
			instance?.remove();
			instance = null;
			map = null;
			if (protocolAdded) void loadMaplibre().then((maplibre) => maplibre.removeProtocol(TILE_PROTOCOL));
		};
	});

	// Theme changes restyle the map in place (locale changes reload the page). Daily's own map and the plain
	// background follow at once; an online map stays until its other style arrives, as its streets matter
	// more than its colours (e.g. offline).
	$effect(() => {
		const current = theme.resolved;
		if (!map || current === styledTheme) return;
		styledTheme = current;
		if (tiles || !fallback) restyle();
		if (!tiles) void useFallback(current);
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

	/* Map credits in the app's colours: MapLibre's are always white, glaring on the dark map. */
	.map :global(.maplibregl-ctrl-attrib.maplibregl-compact) {
		background-color: var(--surface);
		color: var(--fg-muted);
	}

	.map :global(.maplibregl-ctrl-attrib a) {
		color: inherit;
	}

	/* MapLibre draws its "i" button in black. */
	:global([data-theme='dark']) .map :global(.maplibregl-ctrl-attrib-button) {
		filter: invert(1);
	}
</style>
