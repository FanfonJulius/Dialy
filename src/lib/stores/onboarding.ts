import { supabase } from '#lib/data/supabase/client.js';

/** Bump when the privacy notice changes so users see onboarding again. */
export const PRIVACY_VERSION = 1;

function storageKey(userId: string): string {
	return `daily.onboarded.${userId}`;
}

export function isOnboarded(userId: string): boolean {
	try {
		return Number(localStorage.getItem(storageKey(userId))) >= PRIVACY_VERSION;
	} catch {
		return false;
	}
}

export async function completeOnboarding(userId: string): Promise<void> {
	try {
		localStorage.setItem(storageKey(userId), String(PRIVACY_VERSION));
	} catch {
		// Storage blocked: onboarding shows again next time, which is harmless.
	}
	const { error } = await supabase
		.from('profiles')
		.update({ onboarded_at: new Date().toISOString(), privacy_version: PRIVACY_VERSION })
		.eq('id', userId);
	if (error) console.warn('Saving onboarding to the profile failed; it is kept on this device', error.message);
}
