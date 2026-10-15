import { expect, test } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

test('a saved point appears in Saved, opens on the map ready to dial, and can be removed', async ({ page }) => {
	const api = new FakeSupabase();
	await api.install(page);
	await api.signInBeforeLoad(page);
	const [point] = api.points;

	await page.goto('/');
	await page.getByRole('button', { name: /Orange Money 13579/ }).click();
	await page.getByRole('button', { name: 'Save point' }).click();
	await expect(page.getByRole('button', { name: 'Save point' })).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(() => api.saved.has(point.id)).toBe(true);

	await page.getByRole('link', { name: 'Saved' }).click();
	await page.getByRole('button', { name: /Orange Money 13579/ }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator('#point-code')).toHaveText('13579');
	await expect(page.getByLabel('Amount (FCFA)')).toBeVisible();

	await page.getByRole('link', { name: 'Saved' }).click();
	await page.getByRole('button', { name: 'Remove from saved' }).click();
	await expect(page.getByText('No saved points yet')).toBeVisible();
	await expect.poll(() => api.saved.has(point.id)).toBe(false);
	expect(api.unexpected).toEqual([]);
});
