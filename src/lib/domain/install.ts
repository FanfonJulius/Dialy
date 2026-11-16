import * as v from 'valibot';

/**
 * How Daily gets onto the Home screen: Safari's Share menu (iPhone, iPad), the browser menu or the
 * native install prompt (Android), or not at all from an in-app browser (open the real browser first).
 */
export type InstallPlatform = 'ios' | 'android' | 'in-app' | 'other';

/** What the user said to the offer so far, kept on the device. */
export type InstallState = {
	/** When the user last closed the offer without installing. */
	dismissedAt: number | null;
	dismissals: number;
	installed: boolean;
};

/** After "Not now", the offer comes back after a few days of use, not after every dial. */
export const INSTALL_SNOOZE_MS = 3 * 24 * 60 * 60_000;
/** Turned down this many times, it is never shown again. */
export const MAX_INSTALL_OFFERS = 3;

// Facebook, Instagram, Messenger, TikTok, Snapchat, LINE: their built-in browsers cannot install apps.
const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Snapchat|musical_ly|BytedanceWebview|TikTok|\bLine\//i;
// Android web views (apps showing a page, not a browser) announce themselves with "; wv)".
const ANDROID_WEB_VIEW = /;\s*wv\)/;

export function installPlatform(userAgent: string, maxTouchPoints: number): InstallPlatform {
	if (IN_APP_BROWSER.test(userAgent) || ANDROID_WEB_VIEW.test(userAgent)) return 'in-app';
	if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios';
	// iPadOS asks for desktop sites and says it is a Mac; only the touch screen gives it away.
	if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios';
	if (/Android/.test(userAgent)) return 'android';
	return 'other';
}

export function shouldOfferInstall(
	state: InstallState,
	now: number,
	device: { platform: InstallPlatform; standalone: boolean }
): boolean {
	if (device.standalone || state.installed || device.platform === 'other') return false;
	if (state.dismissals >= MAX_INSTALL_OFFERS) return false;
	return state.dismissedAt === null || now - state.dismissedAt >= INSTALL_SNOOZE_MS;
}

const InstallStateSchema = v.object({
	dismissedAt: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
	dismissals: v.pipe(v.number(), v.integer(), v.minValue(0)),
	installed: v.boolean()
});

export function parseInstallState(raw: string | null): InstallState {
	const fresh: InstallState = { dismissedAt: null, dismissals: 0, installed: false };
	if (!raw) return fresh;
	try {
		const result = v.safeParse(InstallStateSchema, JSON.parse(raw));
		return result.success ? result.output : fresh;
	} catch {
		return fresh; // corrupted storage
	}
}
