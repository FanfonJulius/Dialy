import { describe, expect, it } from 'vitest';
import {
	INSTALL_SNOOZE_MS,
	MAX_INSTALL_OFFERS,
	installPlatform,
	parseInstallState,
	shouldOfferInstall,
	type InstallState
} from './install.ts';

const UA = {
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
	ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
	android:
		'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
	androidWebView:
		'Mozilla/5.0 (Linux; Android 13; SM-A145F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36',
	facebook:
		'Mozilla/5.0 (Linux; Android 13; TECNO KI5q) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.40.110;]',
	desktop:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
};

describe('installPlatform', () => {
	it('recognises iPhones, and iPads that present themselves as a Mac', () => {
		expect(installPlatform(UA.iphone, 5)).toBe('ios');
		expect(installPlatform(UA.ipad, 5)).toBe('ios');
		expect(installPlatform(UA.ipad, 0)).toBe('other');
	});

	it('recognises Android browsers', () => {
		expect(installPlatform(UA.android, 5)).toBe('android');
	});

	it('spots in-app browsers and web views, which cannot install anything', () => {
		expect(installPlatform(UA.facebook, 5)).toBe('in-app');
		expect(installPlatform(UA.androidWebView, 5)).toBe('in-app');
	});

	it('does not target computers', () => {
		expect(installPlatform(UA.desktop, 0)).toBe('other');
	});
});

describe('shouldOfferInstall', () => {
	const NOW = Date.parse('2026-11-16T09:00:00Z');
	const fresh: InstallState = { dismissedAt: null, dismissals: 0, installed: false };
	const phone = { platform: 'android' as const, standalone: false };

	it('offers it on a phone browser that has never been asked', () => {
		expect(shouldOfferInstall(fresh, NOW, phone)).toBe(true);
		expect(shouldOfferInstall(fresh, NOW, { platform: 'ios', standalone: false })).toBe(true);
		expect(shouldOfferInstall(fresh, NOW, { platform: 'in-app', standalone: false })).toBe(true);
	});

	it('never offers it once Daily runs from the Home screen or was installed', () => {
		expect(shouldOfferInstall(fresh, NOW, { ...phone, standalone: true })).toBe(false);
		expect(shouldOfferInstall({ ...fresh, installed: true }, NOW, phone)).toBe(false);
	});

	it('never offers it on a computer', () => {
		expect(shouldOfferInstall(fresh, NOW, { platform: 'other', standalone: false })).toBe(false);
	});

	it('waits a few days after "Not now", and stops after being turned down a few times', () => {
		const dismissed = { ...fresh, dismissedAt: NOW, dismissals: 1 };

		expect(shouldOfferInstall(dismissed, NOW + INSTALL_SNOOZE_MS - 1, phone)).toBe(false);
		expect(shouldOfferInstall(dismissed, NOW + INSTALL_SNOOZE_MS, phone)).toBe(true);
		expect(shouldOfferInstall({ ...dismissed, dismissals: MAX_INSTALL_OFFERS }, NOW + 10 * INSTALL_SNOOZE_MS, phone)).toBe(
			false
		);
	});
});

describe('parseInstallState', () => {
	it('reads what was stored and falls back to a fresh state on anything else', () => {
		const stored = { dismissedAt: 1_700_000_000_000, dismissals: 2, installed: false };

		expect(parseInstallState(JSON.stringify(stored))).toEqual(stored);
		expect(parseInstallState(null)).toEqual({ dismissedAt: null, dismissals: 0, installed: false });
		expect(parseInstallState('{"dismissals":"lots"}')).toEqual({ dismissedAt: null, dismissals: 0, installed: false });
		expect(parseInstallState('not json')).toEqual({ dismissedAt: null, dismissals: 0, installed: false });
	});
});
