import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

type Origin = `${string}://${string}.${string}` | `${string}://localhost:${number}`;

function origin(url: string | undefined): Origin[] {
	try {
		return url ? [new URL(url).origin as Origin] : [];
	} catch {
		return [];
	}
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), 'PUBLIC_');
	// Only the project's own Supabase and tile origins, the fallback map (src/lib/map/fallback-style.ts)
	// and the walking-route service (src/lib/data/routing/walking-route.ts).
	const connect = [
		...new Set([
			...origin(env.PUBLIC_SUPABASE_URL),
			...origin(env.PUBLIC_TILES_BASE_URL),
			...origin('https://tiles.openfreemap.org'),
			...origin('https://routing.openstreetmap.de')
		])
	];
	// End-to-end builds use a fake backend and must never replace the real build output.
	const outDir = mode === 'e2e' ? '.e2e-build' : 'build';
	return {
		// A fixed origin: if the port changed, the browser would treat Daily as a new site (signed out, onboarding again).
		server: { port: 5173, strictPort: true },
		preview: { port: 4173, strictPort: true },
		plugins: [
			tailwindcss(),
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/lib/paraglide',
				strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
			}),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				// SPA: one static shell that works offline and inside Capacitor.
				adapter: adapter({ fallback: 'index.html', pages: outDir, assets: outDir }),
				csp: {
					mode: 'hash',
					directives: {
						'default-src': ['self'],
						'script-src': ['self'],
						'style-src': ['self', 'unsafe-inline'],
						'img-src': ['self', 'data:', 'blob:'],
						'font-src': ['self'],
						'connect-src': ['self', ...(connect.length ? connect : (['https://*.supabase.co'] as const))],
						'worker-src': ['self', 'blob:'],
						'manifest-src': ['self'],
						'object-src': ['none'],
						'base-uri': ['self'],
						'form-action': ['self']
					}
				}
			})
		],
		test: {
			include: ['src/**/*.test.ts', 'supabase/tests/**/*.test.ts', 'scripts/**/*.test.ts'],
			environment: 'node',
			testTimeout: 60_000,
			hookTimeout: 180_000
		}
	};
});
