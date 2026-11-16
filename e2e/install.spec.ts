import { expect, test, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

const IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

let api: FakeSupabase;

test.beforeEach(async ({ page, context }) => {
	api = new FakeSupabase();
	await api.install(page);
	await api.signInBeforeLoad(page);
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test.afterEach(() => {
	expect(api.unexpected).toEqual([]);
});

/**
 * Copies the withdrawal code (the Dial button's tel: link would block taps on a headless tab), then
 * comes back to Daily as from the phone's dialer.
 */
async function withdrawAndComeBack(page: Page): Promise<void> {
	await page.getByRole('button', { name: /Orange Money 13579/ }).click();
	await page.getByRole('button', { name: 'FCFA 5,000' }).click();
	await page.getByRole('button', { name: 'Copy code' }).click();
	await expect(page.getByText('Copied. Paste it in your Phone app to dial.')).toBeVisible();
	await page.evaluate(() => {
		const become = (state: DocumentVisibilityState) => {
			Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
			document.dispatchEvent(new Event('visibilitychange'));
		};
		become('hidden');
		become('visible');
	});
}

test('after a withdrawal, Android users see how to install Daily, and not again right away', async ({ page }) => {
	await page.goto('/');
	const offer = page.getByRole('dialog', { name: 'Add Daily to your Home screen' });

	await withdrawAndComeBack(page);

	await expect(offer).toBeVisible();
	await expect(offer.getByText('Tap ⋮ in the top corner of your browser.')).toBeVisible();
	await expect(offer.getByText('Tap “Add to Home screen” or “Install app”.')).toBeVisible();
	await offer.getByRole('button', { name: 'Got it' }).click();
	await expect(offer).toBeHidden();

	await page.getByRole('button', { name: 'Close' }).click();
	await withdrawAndComeBack(page);
	await page.waitForTimeout(1500);
	await expect(offer).toBeHidden();
});

test('it is never offered when Daily already runs from the Home screen', async ({ page }) => {
	await page.addInitScript(() => {
		const matchMedia = window.matchMedia.bind(window);
		window.matchMedia = (query: string) =>
			query === '(display-mode: standalone)'
				? ({ matches: true, media: query } as MediaQueryList)
				: matchMedia(query);
	});
	await page.goto('/');

	await withdrawAndComeBack(page);
	await page.waitForTimeout(1500);

	await expect(page.getByRole('dialog', { name: 'Add Daily to your Home screen' })).toBeHidden();
});

test.describe('on an iPhone', () => {
	test.use({ userAgent: IPHONE });

	test('the steps go through Safari’s Share menu', async ({ page }) => {
		await page.goto('/');

		await withdrawAndComeBack(page);

		const offer = page.getByRole('dialog', { name: 'Add Daily to your Home screen' });
		await expect(offer).toBeVisible();
		await expect(offer.getByText('Tap the Share button in Safari. On iOS 26, tap ⋯ first, then Share.')).toBeVisible();
		await expect(offer.getByText('Scroll down and tap “Add to Home Screen”.')).toBeVisible();
	});
});
