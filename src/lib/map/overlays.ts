import type { FeatureCollection, Point, Polygon } from 'geojson';
import type { ExpressionSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import { circleRing } from '#lib/domain/geo.js';
import type { Fix } from '#lib/domain/location.js';
import type { CashPoint } from '#lib/domain/points.js';

export const POINTS_SOURCE = 'daily-points';
export const USER_SOURCE = 'daily-user';

export const LAYERS = {
	clusters: 'daily-clusters',
	clusterCount: 'daily-cluster-count',
	points: 'daily-points',
	pointLabels: 'daily-point-labels',
	selected: 'daily-selected',
	accuracy: 'daily-user-accuracy',
	userDot: 'daily-user-dot'
} as const;

const FONT = ['Noto Sans Medium'];
const CLUSTER_MAX_ZOOM = 15;

export type OverlayColors = { mtn: string; orange: string; ink: string; location: string; surface: string };

/** Map colours come from the same CSS tokens as the rest of the UI. */
export function readOverlayColors(): OverlayColors {
	const style = getComputedStyle(document.documentElement);
	const token = (name: string) => style.getPropertyValue(`--${name}`).trim();
	return {
		mtn: token('net-mtn'),
		orange: token('net-orange'),
		ink: token('on-network'),
		location: token('location'),
		surface: token('surface')
	};
}

type PointProperties = { id: string; network: string };

export function pointsGeoJson(points: readonly CashPoint[]): FeatureCollection<Point, PointProperties> {
	return {
		type: 'FeatureCollection',
		features: points.map((point) => ({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
			properties: { id: point.id, network: point.network }
		}))
	};
}

export function userGeoJson(fix: Fix | null): FeatureCollection<Point | Polygon> {
	if (!fix) return { type: 'FeatureCollection', features: [] };
	return {
		type: 'FeatureCollection',
		features: [
			{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [circleRing(fix, fix.accuracy)] }, properties: {} },
			{ type: 'Feature', geometry: { type: 'Point', coordinates: [fix.lng, fix.lat] }, properties: {} }
		]
	};
}

export function overlaySources(
	points: FeatureCollection<Point, PointProperties>,
	user: FeatureCollection<Point | Polygon>
): Record<string, SourceSpecification> {
	return {
		[POINTS_SOURCE]: {
			type: 'geojson',
			data: points,
			cluster: true,
			clusterRadius: 48,
			clusterMaxZoom: CLUSTER_MAX_ZOOM,
			clusterProperties: {
				mtn: ['+', ['case', ['==', ['get', 'network'], 'mtn'], 1, 0]],
				orange: ['+', ['case', ['==', ['get', 'network'], 'orange'], 1, 0]]
			}
		},
		[USER_SOURCE]: { type: 'geojson', data: user }
	};
}

export function selectedFilter(id: string | null): ExpressionSpecification {
	return ['==', ['get', 'id'], id ?? ''];
}

export function overlayLayers(colors: OverlayColors, selectedId: string | null): LayerSpecification[] {
	const networkColor: ExpressionSpecification = [
		'match',
		['get', 'network'],
		'mtn',
		colors.mtn,
		'orange',
		colors.orange,
		colors.surface
	];
	const unclustered: ExpressionSpecification = ['!', ['has', 'point_count']];
	return [
		{
			id: LAYERS.accuracy,
			type: 'fill',
			source: USER_SOURCE,
			filter: ['==', ['geometry-type'], 'Polygon'],
			paint: { 'fill-color': colors.location, 'fill-opacity': 0.15, 'fill-outline-color': colors.location }
		},
		{
			id: LAYERS.clusters,
			type: 'circle',
			source: POINTS_SOURCE,
			filter: ['has', 'point_count'],
			paint: {
				'circle-color': ['case', ['>=', ['get', 'mtn'], ['get', 'orange']], colors.mtn, colors.orange],
				'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
				'circle-stroke-width': 2,
				'circle-stroke-color': colors.ink
			}
		},
		{
			id: LAYERS.clusterCount,
			type: 'symbol',
			source: POINTS_SOURCE,
			filter: ['has', 'point_count'],
			layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': FONT, 'text-size': 13 },
			paint: { 'text-color': colors.ink }
		},
		{
			id: LAYERS.selected,
			type: 'circle',
			source: POINTS_SOURCE,
			filter: ['all', unclustered, selectedFilter(selectedId)],
			paint: { 'circle-radius': 19, 'circle-color': colors.ink, 'circle-opacity': 0.25 }
		},
		{
			id: LAYERS.points,
			type: 'circle',
			source: POINTS_SOURCE,
			filter: unclustered,
			paint: {
				'circle-color': networkColor,
				'circle-radius': 12,
				'circle-stroke-width': 2,
				'circle-stroke-color': colors.ink
			}
		},
		{
			// A letter on each pin so networks are told apart without relying on colour.
			id: LAYERS.pointLabels,
			type: 'symbol',
			source: POINTS_SOURCE,
			filter: unclustered,
			layout: {
				'text-field': ['match', ['get', 'network'], 'mtn', 'M', 'orange', 'O', '•'],
				'text-font': FONT,
				'text-size': 12,
				'text-allow-overlap': true,
				'text-ignore-placement': true
			},
			paint: { 'text-color': colors.ink }
		},
		{
			id: LAYERS.userDot,
			type: 'circle',
			source: USER_SOURCE,
			filter: ['==', ['geometry-type'], 'Point'],
			paint: {
				'circle-radius': 8,
				'circle-color': colors.location,
				'circle-stroke-width': 3,
				'circle-stroke-color': '#ffffff'
			}
		}
	];
}
