import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

let api: FakeSupabase;

/**
 * After a tel: link, a headless browser blocks taps on that tab (there is no dialer to
 * come back from, and a reload keeps the block), so the test carries on in a new tab.
 */
async function openTab(page: Page, path: string): Promise<Page> {
	const tab = await page.context().newPage();
	await api.signInBeforeLoad(tab);
	await tab.goto(path);
	return tab;
}

test.beforeEach(async ({ page }) => {
	api = new FakeSupabase();
	await api.install(page);
	await api.signInBeforeLoad(page);
});

test.afterEach(() => {
	expect(api.unexpected).toEqual([]);
});

test('withdrawals and donations are added to the history when dialed, not before', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Orange Money 13579/ }).click();
	await page.getByRole('button', { name: 'FCFA 5,000' }).click();

	// Typed but not dialed: nothing in the history yet.
	await page.getByRole('link', { name: 'History' }).click();
	await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
	await expect(page.getByText('Nothing here yet')).toBeVisible();

	await page.getByRole('link', { name: 'Back to the map' }).click();
	await page.getByRole('button', { name: /Orange Money 13579/ }).click();
	await page.getByRole('button', { name: 'FCFA 5,000' }).click();
	await page.getByRole('button', { name: 'Dial' }).click();
	await expect.poll(() => api.withdrawals.length).toBe(1);

	const donations = await openTab(page, '/donations');
	await donations.getByRole('button', { name: 'FCFA 1,000' }).click();
	await donations.getByRole('button', { name: 'Dial' }).click();

	const history = await openTab(page, '/history');
	const transactions = history.getByRole('tabpanel');
	await expect(transactions.getByText('Donation to Daily')).toBeVisible();
	await expect(transactions.getByText('FCFA 1,000')).toBeVisible();
	await expect(transactions.getByText('13579')).toBeVisible();
	await expect(transactions.getByText('FCFA 5,000')).toBeVisible();

	await history.getByRole('tab', { name: 'Points' }).click();
	await expect(history.getByText('Withdrawals: 1 · Total FCFA 5,000')).toBeVisible();

	// A point in the history opens on the map.
	await history.getByRole('tabpanel').getByRole('button', { name: /13579/ }).click();
	await expect(history.locator('#point-code')).toHaveText('13579');
});

test('withdrawals made on another phone appear in the history', async ({ page }) => {
	api.history.push({
		client_uuid: randomUUID(),
		amount: 20000,
		captured_at: '2026-10-15T09:30:00+00:00',
		point_id: api.points[1].id
	});

	await page.goto('/history');

	await expect(page.getByText('24680')).toBeVisible();
	await expect(page.getByText('FCFA 20,000')).toBeVisible();
});
