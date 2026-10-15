export type SignedInUser = { id: string; email: string | null };

/**
 * Reads the session that supabase-js keeps in storage. Used when the app starts offline with an
 * expired access token: supabase-js then reports no session although it keeps the refresh token.
 */
export function parseStoredSession(raw: string | null): SignedInUser | null {
	if (!raw) return null;
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== 'object' || value === null) return null;
		const { refresh_token: refreshToken, user } = value as { refresh_token?: unknown; user?: unknown };
		if (typeof refreshToken !== 'string' || refreshToken === '' || typeof user !== 'object' || user === null) {
			return null;
		}
		const { id, email } = user as { id?: unknown; email?: unknown };
		if (typeof id !== 'string' || id === '') return null;
		return { id, email: typeof email === 'string' ? email : null };
	} catch {
		return null; // corrupted storage: treat as signed out
	}
}
