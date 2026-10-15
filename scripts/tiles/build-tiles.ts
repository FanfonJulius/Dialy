// Builds the basemap for Daily: one overview archive plus one detail archive per z8 cell,
// each small enough for Supabase Storage's 50 MB free-plan limit.
// Usage: node scripts/tiles/build-tiles.ts [YYYYMMDD]   (needs the `pmtiles` CLI; set PMTILES_BIN to override)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cellKey, type TileManifest } from '../../src/lib/domain/tile-manifest.ts';
import { tileBounds, type Bounds } from '../../src/lib/domain/tiles.ts';
import { cellsCoveringRing, type Position } from './cells.ts';

const OUT_DIR = '.tiles';
const PMTILES = process.env.PMTILES_BIN ?? 'pmtiles';
const SOURCE_BASE = 'https://build.protomaps.com';
const OVERVIEW_MAX_ZOOM = 10;
const CELL_ZOOM = 8;
const DETAIL_MIN_ZOOM = 11;
const DETAIL_MAX_ZOOM = 14;
const CELL_MARGIN_DEG = 0.1;
const OVERVIEW_MARGIN_DEG = 0.5;
const MAX_FILE_BYTES = 49 * 1024 * 1024;
const EDGE_EPSILON = 1e-6; // keeps a cell's bbox from pulling in its neighbours' tiles
const LOOKBACK_DAYS = 10;
const ATTRIBUTION =
	'<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';

function ymd(date: Date): string {
	return date.toISOString().slice(0, 10).replaceAll('-', '');
}

async function latestBuild(): Promise<string> {
	for (let daysAgo = 0; daysAgo < LOOKBACK_DAYS; daysAgo++) {
		const build = ymd(new Date(Date.now() - daysAgo * 86_400_000));
		const response = await fetch(`${SOURCE_BASE}/${build}.pmtiles`, { method: 'HEAD' });
		if (response.ok) return build;
	}
	throw new Error(`No Protomaps build found in the last ${LOOKBACK_DAYS} days`);
}

function bbox(b: Bounds, inset = 0): string {
	return [b.west + inset, b.south + inset, b.east - inset, b.north - inset].map((n) => n.toFixed(6)).join(',');
}

function extract(source: string, output: string, area: Bounds, minZoom: number, maxZoom: number): number {
	execFileSync(
		PMTILES,
		['extract', source, output, `--bbox=${bbox(area, EDGE_EPSILON)}`, `--minzoom=${minZoom}`, `--maxzoom=${maxZoom}`],
		{ stdio: ['ignore', 'ignore', 'inherit'] }
	);
	const bytes = statSync(output).size;
	if (bytes > MAX_FILE_BYTES) throw new Error(`${output} is ${bytes} bytes, over the storage file limit`);
	return bytes;
}

async function main(): Promise<void> {
	const requested = process.argv[2];
	if (requested && !/^\d{8}$/.test(requested)) throw new Error('Build must look like YYYYMMDD');
	const build = requested ?? (await latestBuild());
	const source = `${SOURCE_BASE}/${build}.pmtiles`;
	console.log(`Building tiles from ${source}`);

	const ring: Position[] = JSON.parse(readFileSync(new URL('./cameroon.geojson', import.meta.url), 'utf8'))
		.geometry.coordinates[0];
	const lngs = ring.map((p) => p[0]);
	const lats = ring.map((p) => p[1]);
	const country: Bounds = {
		west: Math.min(...lngs) - OVERVIEW_MARGIN_DEG,
		south: Math.min(...lats) - OVERVIEW_MARGIN_DEG,
		east: Math.max(...lngs) + OVERVIEW_MARGIN_DEG,
		north: Math.max(...lats) + OVERVIEW_MARGIN_DEG
	};

	rmSync(OUT_DIR, { recursive: true, force: true });
	const buildDir = join(OUT_DIR, build);
	mkdirSync(join(buildDir, 'cells'), { recursive: true });

	const overviewFile = 'overview.pmtiles';
	const overviewBytes = extract(source, join(buildDir, overviewFile), country, 0, OVERVIEW_MAX_ZOOM);
	console.log(`overview: ${(overviewBytes / 1e6).toFixed(1)} MB`);

	const cells: TileManifest['detail']['cells'] = {};
	const covering = cellsCoveringRing(ring, CELL_ZOOM, CELL_MARGIN_DEG);
	for (const [index, { x, y }] of covering.entries()) {
		const file = `cells/${x}-${y}.pmtiles`;
		const bytes = extract(source, join(buildDir, file), tileBounds(CELL_ZOOM, x, y), DETAIL_MIN_ZOOM, DETAIL_MAX_ZOOM);
		cells[cellKey(x, y)] = { file, bytes };
		console.log(`cell ${index + 1}/${covering.length} ${x}/${y}: ${(bytes / 1e6).toFixed(1)} MB`);
	}

	const manifest: TileManifest = {
		version: 1,
		build,
		attribution: ATTRIBUTION,
		overview: { file: overviewFile, maxZoom: OVERVIEW_MAX_ZOOM },
		detail: { cellZoom: CELL_ZOOM, minZoom: DETAIL_MIN_ZOOM, maxZoom: DETAIL_MAX_ZOOM, cells }
	};
	writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
	const total = overviewBytes + Object.values(cells).reduce((sum, cell) => sum + cell.bytes, 0);
	console.log(`Done: ${covering.length} cells, ${(total / 1e6).toFixed(0)} MB in ${buildDir}`);
}

await main();
