import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { clearUserData, db } from '#lib/data/local/db.js';
import { AUTH_STORAGE_KEY, supabase } from '#lib/data/supabase/client.js';
import { authErrorKey, type AuthErrorKey } from '#lib/domain/auth.js';
import { parseStoredSession, type SignedInUser } from '#lib/domain/session.js';

export type SignUpResult = AuthErrorKey | 'confirmation_pending' | null;
export type DeleteAccountResult = 'offline' | 'failed' | null;

const SESSION_TIMEOUT_MS = 4000;

function toUser(session: Session): SignedInUser {
	return { id: session.user.id, email: session.user.email ?? null };
}

function storedSessionUser(): SignedInUser | null {
	try {
		return parseStoredSession(localStorage.getItem(AUTH_STORAGE_KEY));
	} catch {
		return null; // storage blocked
	}
}

class SessionStore {
	user = $state.raw<SignedInUser | null>(null);
	#initialized: Promise<void> | null = null;

	/** Resolves once the stored session is known. Safe to call many times. */
	init(): Promise<void> {
		return (this.#initialized ??= this.#load());
	}

	async #load(): Promise<void> {
		supabase.auth.onAuthStateChange((event, session) => {
			if (session) this.user = toUser(session);
			else if (event === 'SIGNED_OUT') this.#signedOut();
		});
		// An expired token is refreshed over the network; on a weak connection the app must not wait for it.
		const timedOut = Symbol('timed out');
		const result = await Promise.race([
			supabase.auth.getSession(),
			new Promise<typeof timedOut>((resolve) => setTimeout(() => resolve(timedOut), SESSION_TIMEOUT_MS))
		]);
		if (result === timedOut) {
			this.user ??= storedSessionUser();
			return;
		}
		const { data, error } = result;
		if (data.session) {
			this.user = toUser(data.session);
		} else if (error && isAuthRetryableFetchError(error)) {
			// Offline with an expired access token: supabase-js keeps the refresh token and retries later.
			this.user = storedSessionUser();
		}
	}

	async signIn(email: string, password: string): Promise<AuthErrorKey | 'confirmation_pending' | null> {
		const { error } = await supabase.auth.signInWithPassword({ email, password });
		if (!error) return null;
		return error.code === 'email_not_confirmed' ? 'confirmation_pending' : authErrorKey(error);
	}

	async signUp(email: string, password: string): Promise<SignUpResult> {
		const { data, error } = await supabase.auth.signUp({ email, password });
		if (error) return authErrorKey(error);
		// Daily does not verify emails; no session means "Confirm email" is still on in the project.
		return data.session ? null : 'confirmation_pending';
	}

	async signOut(): Promise<void> {
		const { error } = await supabase.auth.signOut();
		if (error) await supabase.auth.signOut({ scope: 'local' });
		this.#signedOut();
	}

	async deleteAccount(): Promise<DeleteAccountResult> {
		const { error } = await supabase.rpc('delete_my_account');
		if (error) return navigator.onLine ? 'failed' : 'offline';
		await supabase.auth.signOut({ scope: 'local' });
		this.#signedOut();
		return null;
	}

	#signedOut(): void {
		this.user = null;
		// Saved points and unsent changes belong to the account, not the device.
		clearUserData(db).catch((error: unknown) => console.error('Clearing account data failed', error));
	}
}

export const session = new SessionStore();
