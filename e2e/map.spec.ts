import { expect, test, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

let api: FakeSupabase;

test.beforeEach(async ({ page }) => {
	api = new FakeSupabase();
	await api.install(page);
	await api.signInBeforeLoad(page);
});

test.afterEach(() => {
	expect(api.unexpected).toEqual([]);
});

async function pressOnMap(page: Page, key: string): Promise<void> {
	await page.locator('.maplibregl-canvas').focus();
	await page.keyboard.press(key);
}

test('the arrow closes the Nearby panel down to its title and opens it again', async ({ page }) => {
	await page.goto('/');
	const nearby = page.getByRole('region', { name: 'Nearby' });
	const agent = nearby.getByRole('button', { name: /Orange Money 13579/ });
	await expect(agent).toBeVisible();

	await nearby.getByRole('button', { name: /Hide the list/ }).click();
	await expect(agent).toBeHidden();
	await expect(nearby.getByText('Nearby', { exact: true })).toBeVisible();

	await nearby.getByRole('button', { name: /Show the list/ }).click();
	await expect(agent).toBeVisible();
});

test('zooming into the map hides everything over it, zooming out brings it back', async ({ page }) => {
	await page.goto('/');
	const search = page.getByRole('textbox', { name: 'Search by agent code' });
	const tabs = page.getByRole('navigation', { name: 'Main navigation' });
	const nearby = page.getByRole('region', { name: 'Nearby' });
	await expect(nearby.getByRole('button', { name: /Orange Money 13579/ })).toBeVisible();

	await pressOnMap(page, 'Equal');
	await expect(search).toBeHidden();
	await expect(tabs).toBeHidden();
	await expect(nearby).toBeHidden();

	await pressOnMap(page, 'Minus');
	await expect(search).toBeVisible();
	await expect(tabs).toBeVisible();
	await expect(nearby).toBeVisible();
});
