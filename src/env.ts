import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

// Static public values are baked into the build: set them in .env locally and in Vercel's project settings.
export const variables = defineEnvVars({
	PUBLIC_SUPABASE_URL: {
		public: true,
		static: true,
		description: 'Supabase project URL, e.g. https://abcd.supabase.co',
		schema: v.pipe(v.string(), v.url(), v.startsWith('https://'))
	},
	PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
		public: true,
		static: true,
		description: 'Supabase publishable (anon) key. Never a secret/service_role key.',
		schema: v.pipe(
			v.string(),
			v.minLength(20),
			v.check((key) => !key.startsWith('sb_secret_'), 'Secret keys must never be shipped in the app')
		)
	},
	PUBLIC_TILES_BASE_URL: {
		public: true,
		static: true,
		description: 'Optional override of where map tiles are served from (defaults to the Supabase "tiles" bucket).',
		schema: v.optional(v.union([v.literal(''), v.pipe(v.string(), v.url())]), '')
	}
});
