import { self } from '$app/service-worker';
import { dev, version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { resolve } from '$app/paths';

const CACHE_PREFIX = 'daily-shell-';
const CACHE = `${CACHE_PREFIX}${version}`;
const SHELL: string = resolve('');
const BASE = SHELL.replace(/\/$/, '');
// Map fonts and sprites rarely change: cached on first use, kept across app updates.
const MAP_CACHE = 'daily-map-v1';
const MAP_PREFIX = `${BASE}/map/`;

// Manifest paths are relative to the base path.
const PRECACHE: string[] = [
	SHELL,
	...immutable.map((file) => `${BASE}/${file.path}`),
	...assets.map((file) => `${BASE}/${file.path}`).filter((path) => !path.startsWith(MAP_PREFIX))
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

async function cacheOnUse(request: Request): Promise<Response> {
	const cache = await caches.open(MAP_CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) await cache.put(request, response.clone());
	return response;
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
		} else if (url.pathname.startsWith(MAP_PREFIX)) {
			event.respondWith(cacheOnUse(request));
		} else if (PRECACHED_PATHS.has(url.pathname)) {
			event.respondWith(cacheFirst(url.pathname, request));
		}
	});
}
