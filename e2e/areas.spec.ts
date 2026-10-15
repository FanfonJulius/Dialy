import { expect, test } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

test('the area on screen can be downloaded for offline use, listed and deleted', async ({ page }) => {
	const api = new FakeSupabase();
	await api.install(page);
	await api.signInBeforeLoad(page);

	await page.goto('/');
	await expect(page.getByRole('button', { name: /Orange Money 13579/ })).toBeVisible();
	// No tiles of Daily's own yet: the online fallback map is used instead of a blank one.
	await expect.poll(() => api.fallbackStyleRequests).toBeGreaterThan(0);

	await page.getByRole('button', { name: 'Download this area' }).click();
	await expect(page.getByRole('heading', { name: 'Use this area offline' })).toBeVisible();
	// The e2e backend publishes no basemap, so only the cash points are saved.
	await expect(page.getByText("The map isn't published yet, so only the cash points will be saved.")).toBeVisible();
	await page.getByLabel('Name').fill('Home');
	await page.getByRole('button', { name: 'Download', exact: true }).click();
	await expect(page.getByText('Ready to use offline.')).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).last().click();

	await page.getByRole('link', { name: 'Profile' }).click();
	await page.getByRole('link', { name: 'Offline areas' }).click();
	await expect(page.getByText('Home')).toBeVisible();
	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('No offline areas yet.', { exact: false })).toBeVisible();
	expect(api.unexpected).toEqual([]);
});

test('an offline area stores the real map tiles of the place', async ({ page }) => {
	const api = new FakeSupabase();
	api.basemap = true;
	await api.install(page);
	await api.signInBeforeLoad(page);

	await page.goto('/');
	await expect(page.getByRole('button', { name: /Orange Money 13579/ })).toBeVisible();
	await page.getByRole('button', { name: 'Download this area' }).click();
	await expect(page.getByText(/^About \d/)).toBeVisible();
	await page.getByRole('button', { name: 'Download', exact: true }).click();
	await expect(page.getByText('Ready to use offline.')).toBeVisible();

	const stored = await page.evaluate(
		() =>
			new Promise<{ tiles: number; withData: number }>((resolve, reject) => {
				const open = indexedDB.open('daily');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const request = open.result.transaction('tiles').objectStore('tiles').getAll();
					request.onsuccess = () => {
						const pinned = (request.result as { pinned: number; data: ArrayBuffer }[]).filter((tile) => tile.pinned === 1);
						resolve({ tiles: pinned.length, withData: pinned.filter((tile) => tile.data.byteLength > 0).length });
					};
				};
			})
	);
	expect(api.tileRangeRequests).toBeGreaterThan(0);
	// Street-level tiles of the fixture are real vector data; low zooms it lacks are kept as empty tiles.
	expect(stored.withData).toBeGreaterThan(3);
	expect(stored.tiles).toBeGreaterThan(stored.withData);
	expect(api.unexpected).toEqual([]);
});
