import { self } from '$app/service-worker';
import { dev, version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { resolve } from '$app/paths';

const CACHE_PREFIX = 'daily-shell-';
const CACHE = `${CACHE_PREFIX}${version}`;
const SHELL: string = resolve('');
const BASE = SHELL.replace(/\/$/, '');

// Manifest paths are relative to the base path.
const PRECACHE: string[] = [
	SHELL,
	...immutable.map((file) => `${BASE}/${file.path}`),
	...assets.map((file) => `${BASE}/${file.path}`)
];
const PRECACHED_PATHS = new Set(PRECACHE);

async function precache(): Promise<void> {
	const cache = await caches.open(CACHE);
	await cache.addAll(PRECACHE);
}

async function deleteOldCaches(): Promise<void> {
	const keys = await caches.keys();
	await Promise.all(
		keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))
	);
}

async function cacheFirst(cacheKey: string, request: Request): Promise<Response> {
	const cache = await caches.open(CACHE);
	return (await cache.match(cacheKey)) ?? fetch(request);
}

// In dev the build manifest is empty and caching would fight hot reload.
if (!dev) {
	self.addEventListener('install', (event) => {
		event.waitUntil(precache());
	});

	self.addEventListener('activate', (event) => {
		event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
	});

	self.addEventListener('message', (event) => {
		if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
	});

	self.addEventListener('fetch', (event) => {
		const { request } = event;
		if (request.method !== 'GET') return;

		const url = new URL(request.url);
		// Supabase, tiles and other origins go straight to the network.
		if (url.origin !== self.location.origin) return;

		if (request.mode === 'navigate') {
			// SPA: every route is rendered by the same shell.
			event.respondWith(cacheFirst(SHELL, request));
		} else if (PRECACHED_PATHS.has(url.pathname)) {
			event.respondWith(cacheFirst(url.pathname, request));
		}
	});
}
