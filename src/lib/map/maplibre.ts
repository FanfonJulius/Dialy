import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

type MapLibre = typeof import('maplibre-gl');

let loading: Promise<MapLibre> | null = null;

/** Loads MapLibre on demand (it is the largest dependency) and points it at its self-hosted worker. */
export function loadMaplibre(): Promise<MapLibre> {
	return (loading ??= import('maplibre-gl').then((maplibre) => {
		maplibre.setWorkerUrl(workerUrl);
		return maplibre;
	}));
}
