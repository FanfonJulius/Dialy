import { expect, test } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

test.use({ serviceWorkers: 'allow' });

test('once loaded, the app opens without a connection', async ({ page, context }) => {
	const api = new FakeSupabase();
	await api.install(page);
	await api.signInBeforeLoad(page);

	await page.goto('/');
	await expect(page.getByRole('region', { name: 'Nearby' })).toBeVisible();
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	// Let the newly installed worker take control of this page.
	await page.reload();
	await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
	await expect(page.getByRole('button', { name: /Orange Money 13579/ })).toBeVisible();

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('region', { name: 'Nearby' })).toBeVisible();
	await expect(page.getByText("Offline · showing what's on this phone")).toBeVisible();
	await expect(page.getByRole('button', { name: /Orange Money 13579/ })).toBeVisible();

	await page.getByRole('link', { name: 'Profile' }).click();
	await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
});
