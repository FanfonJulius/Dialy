import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public';
import type { Database } from './database.types.js';

export const AUTH_STORAGE_KEY = 'daily.auth';

export const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
	auth: {
		storageKey: AUTH_STORAGE_KEY,
		persistSession: true,
		autoRefreshToken: true,
		// Email + password only: no tokens ever arrive in the URL.
		detectSessionInUrl: false
	}
});
