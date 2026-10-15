import { supabase } from '#lib/data/supabase/client.js';

/** Bump when the privacy notice changes so users see onboarding again. */
export const PRIVACY_VERSION = 1;
const SERVER_CHECK_TIMEOUT_MS = 4000;

function storageKey(userId: string): string {
	return `daily.onboarded.${userId}`;
}

function rememberOnDevice(userId: string): void {
	try {
		localStorage.setItem(storageKey(userId), String(PRIVACY_VERSION));
	} catch {
		// Storage blocked: the account on the server still remembers it.
	}
}

export function isOnboarded(userId: string): boolean {
	try {
		return Number(localStorage.getItem(storageKey(userId))) >= PRIVACY_VERSION;
	} catch {
		return false;
	}
}

/** Onboarding is shown once per account: a new phone or browser asks the server before showing it again. */
export async function hasOnboarded(userId: string): Promise<boolean> {
	if (isOnboarded(userId)) return true;
	try {
		const { data } = await supabase
			.from('profiles')
			.select('onboarded_at, privacy_version')
			.eq('id', userId)
			.abortSignal(AbortSignal.timeout(SERVER_CHECK_TIMEOUT_MS))
			.maybeSingle();
		const done = Boolean(data?.onboarded_at) && (data?.privacy_version ?? 0) >= PRIVACY_VERSION;
		if (done) rememberOnDevice(userId);
		return done;
	} catch {
		return false; // offline on a new device: show onboarding
	}
}

export async function completeOnboarding(userId: string): Promise<void> {
	rememberOnDevice(userId);
	const { error } = await supabase
		.from('profiles')
		.update({ onboarded_at: new Date().toISOString(), privacy_version: PRIVACY_VERSION })
		.eq('id', userId);
	if (error) console.warn('Saving onboarding to the profile failed; it is kept on this device', error.message);
}
