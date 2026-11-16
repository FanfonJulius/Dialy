import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';
import { openNearby } from './nearby';

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

test('Daily opens on the map: Nearby is folded to its title and how many agents are near, nothing is focused', async ({
	page
}) => {
	await page.goto('/');
	const nearby = page.getByRole('region', { name: 'Nearby' });
	const agent = nearby.getByRole('button', { name: /Orange Money 13579/ });
	const toggle = nearby.getByRole('button', { name: /Show the list/ });
	// One agent within 100 m (the other one is farther).
	await expect(toggle).toHaveAccessibleName(/^Nearby\s*1(?!\d)/);
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(agent).toBeHidden();
	// No field is focused, so phones do not bring up the keyboard over the map.
	expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');

	await toggle.click();
	await expect(agent).toBeVisible();
	await nearby.getByRole('button', { name: /Hide the list/ }).click();
	await expect(agent).toBeHidden();
	await expect(nearby.getByText('Nearby', { exact: true })).toBeVisible();
});

test('in a busy market, more agents near than the list holds show as "20+"', async ({ page }) => {
	const [agent] = api.points;
	for (let i = 1; i <= 24; i++) {
		api.points.push({ ...agent, id: randomUUID(), code: String(20_000 + i), lat: agent.lat + i * 0.00001 });
	}
	await page.goto('/');

	await expect(
		page.getByRole('region', { name: 'Nearby' }).getByRole('button', { name: /Show the list/ })
	).toHaveAccessibleName(/^Nearby\s*20\+/);
});

test('zooming into the map hides everything over it, zooming out brings it back', async ({ page }) => {
	await page.goto('/');
	const search = page.getByRole('textbox', { name: 'Search by agent code' });
	const tabs = page.getByRole('navigation', { name: 'Main navigation' });
	const nearby = page.getByRole('region', { name: 'Nearby' });
	await openNearby(page);
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

test('Nearby lists only agents within 100 m; the rest are on the map and found by searching', async ({ page }) => {
	await page.goto('/');
	const nearby = page.getByRole('region', { name: 'Nearby' });
	await openNearby(page);
	await expect(nearby.getByRole('button', { name: /Orange Money 13579/ })).toBeVisible(); // about 30 m away
	await expect(nearby.getByRole('button', { name: /24680/ })).toHaveCount(0); // about 170 m away

	const search = page.getByRole('textbox', { name: 'Search by agent code' });
	await search.fill('24680');
	// Typing alone changes nothing; the Search button (or the keyboard's search key) finds the agent.
	await expect(page.locator('#point-code')).toHaveCount(0);
	await page.getByRole('button', { name: 'Search', exact: true }).click();

	await expect(page.locator('#point-code')).toHaveText('24680');
	await expect(page.getByText('170 m away')).toBeVisible();
});

test('searching a code that is not on the map says so', async ({ page }) => {
	await page.goto('/');
	await openNearby(page);
	await expect(page.getByRole('button', { name: /Orange Money 13579/ })).toBeVisible();

	await page.getByRole('textbox', { name: 'Search by agent code' }).fill('999999');
	await page.keyboard.press('Enter');

	await expect(page.getByText('No agent with code 999999 on the map here yet.')).toBeVisible();
	await page.getByRole('button', { name: 'Clear search' }).click();
	await expect(page.getByText('No agent with code 999999 on the map here yet.')).toBeHidden();
	// Clearing does not bring up the keyboard.
	await expect(page.getByRole('textbox', { name: 'Search by agent code' })).not.toBeFocused();
});

test('the launch screen shows the logo and name while Daily starts, then gets out of the way', async ({ page }) => {
	// Part of the page itself, so it is painted before any script runs (even from the home screen).
	const shell = await (await page.request.get('/')).text();
	expect(shell).toContain('id="launch"');
	expect(shell).toContain('class="launch-name" aria-hidden="true">Daily</p>');

	await page.goto('/');

	await openNearby(page);
	await expect(page.getByRole('button', { name: /Orange Money 13579/ })).toBeVisible();
	await expect(page.locator('#launch')).toHaveCount(0);
});
