import { expect, test } from '@playwright/test';
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

test('the Donations tab dials a transfer to the MTN or Orange number', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Donations' }).click();

	await expect(page.getByRole('heading', { name: 'Donations' })).toBeVisible();
	await expect(page.getByText('654 57 19 14')).toBeVisible();
	await expect(page.getByText('*126*9*654571914*····#')).toBeVisible();

	await page.getByRole('button', { name: 'Dial' }).click();
	await expect(page.getByText('Enter an amount.')).toBeVisible();
	await page.getByLabel('Amount (FCFA)').fill('50');
	await expect(page.getByText('The minimum is FCFA 100.')).toBeVisible();

	await page.getByRole('button', { name: 'FCFA 1,000' }).click();
	await expect(page.getByText('*126*9*654571914*1000#')).toBeVisible();

	await page.getByRole('radio', { name: 'Orange Money' }).click();
	await expect(page.getByText('691 42 53 34')).toBeVisible();
	await expect(page.getByText('#150*1*1*691425334*1000#')).toBeVisible();

	// A donation is a plain transfer: nothing is recorded on the server.
	await page.getByRole('button', { name: 'Dial' }).click();
	expect(api.withdrawals).toEqual([]);
});
