// Uploads .tiles/ to the public `tiles` bucket, then switches manifest.json to the new build
// and deletes builds older than the previous one (free plan: 1 GB storage).
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY (server-side only: GitHub Actions secret, never the app).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { isTileManifest } from '../../src/lib/domain/tile-manifest.ts';

const OUT_DIR = '.tiles';
const BUCKET = 'tiles';
const KEEP_BUILDS = 2;
const BUILD_CACHE = '31536000'; // build folders never change
const MANIFEST_CACHE = '300';

function env(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing environment variable ${name}`);
	return value;
}

function listFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)]
	);
}

async function main(): Promise<void> {
	const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const storage = supabase.storage.from(BUCKET);

	const manifestJson = readFileSync(join(OUT_DIR, 'manifest.json'), 'utf8');
	const manifest: unknown = JSON.parse(manifestJson);
	if (!isTileManifest(manifest)) throw new Error('.tiles/manifest.json is not a valid tile manifest');

	const buildDir = join(OUT_DIR, manifest.build);
	for (const file of listFiles(buildDir)) {
		const path = relative(OUT_DIR, file).split(sep).join('/');
		const { error } = await storage.upload(path, readFileSync(file), {
			upsert: true,
			cacheControl: BUILD_CACHE,
			contentType: 'application/vnd.pmtiles'
		});
		if (error) throw new Error(`Uploading ${path} failed: ${error.message}`);
		console.log(`uploaded ${path}`);
	}

	// Last, so clients only ever see a manifest whose files are all in place.
	const { error: manifestError } = await storage.upload('manifest.json', manifestJson, {
		upsert: true,
		cacheControl: MANIFEST_CACHE,
		contentType: 'application/json'
	});
	if (manifestError) throw new Error(`Uploading manifest.json failed: ${manifestError.message}`);
	console.log(`manifest now points at ${manifest.build}`);

	const { data: entries, error: listError } = await storage.list('', { limit: 1000 });
	if (listError) throw new Error(`Listing builds failed: ${listError.message}`);
	const builds = entries
		.filter((entry) => entry.id === null && /^\d{8}$/.test(entry.name)) // folders
		.map((entry) => entry.name)
		.sort()
		.reverse();
	for (const old of builds.filter((b) => b !== manifest.build).slice(KEEP_BUILDS - 1)) {
		const paths = await listRemote(storage, old);
		for (let i = 0; i < paths.length; i += 100) {
			const { error } = await storage.remove(paths.slice(i, i + 100));
			if (error) throw new Error(`Deleting ${old} failed: ${error.message}`);
		}
		console.log(`deleted old build ${old} (${paths.length} files)`);
	}
}

type Bucket = ReturnType<ReturnType<typeof createClient>['storage']['from']>;

async function listRemote(storage: Bucket, prefix: string): Promise<string[]> {
	const { data, error } = await storage.list(prefix, { limit: 1000 });
	if (error) throw new Error(`Listing ${prefix} failed: ${error.message}`);
	const nested = await Promise.all(
		data.map((entry) =>
			entry.id === null ? listRemote(storage, `${prefix}/${entry.name}`) : [`${prefix}/${entry.name}`]
		)
	);
	return nested.flat();
}

await main();
