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

test('tapping a nearby agent, choosing an amount and dialing records the withdrawal', async ({ page }) => {
	const [point] = api.points;
	await page.goto('/');

	await page.getByRole('button', { name: /Orange Money 13579/ }).click();
	await expect(page.locator('#point-code')).toHaveText('13579');
	await page.getByRole('button', { name: 'FCFA 5,000' }).click();
	await expect(page.getByText('#150*14*13579*5000#')).toBeVisible();

	await page.getByRole('button', { name: 'Dial' }).click();

	await expect.poll(() => api.withdrawals.length).toBe(1);
	expect(api.withdrawals[0]).toMatchObject({
		p_network_id: 'orange',
		p_code: '13579',
		p_amount: 5000,
		p_point_id: point.id,
		p_lat: 3.8667,
		p_lng: 11.5167
	});
});

test('the amount is checked before dialing', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Show the list/ }).click();
	await page.getByRole('button', { name: /MTN MoMo 24680/ }).click();

	await page.getByRole('button', { name: 'Dial' }).click();
	await expect(page.getByText('Enter an amount.')).toBeVisible();
	await page.getByLabel('Amount (FCFA)').fill('300');
	await expect(page.getByText('The minimum is FCFA 500.')).toBeVisible();
	expect(api.withdrawals).toEqual([]);
});

test('a withdrawal dialed offline is kept and sent once back online', async ({ page, context }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Orange Money 13579/ })).toBeVisible();

	api.unreachable = true;
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Withdraw' }).click();
	// The dial code of the network is written before anything is typed.
	await expect(page.getByText('*126*16*····*····#')).toBeVisible();
	await page.getByRole('radio', { name: 'Orange Money' }).last().click();
	await expect(page.getByText('#150*14*····*····#')).toBeVisible();
	await expect(page.getByText('#150*14*', { exact: true }).first()).toBeVisible();
	await page.getByRole('textbox', { name: 'Agent code', exact: true }).fill('97531');
	await expect(page.getByText('#150*14*97531*····#')).toBeVisible();
	await page.getByLabel('Amount (FCFA)').fill('2500');
	await expect(page.getByText('#150*14*97531*2500#')).toBeVisible();
	await page.getByRole('button', { name: 'Dial' }).click();

	await expect(page.getByText('1 changes waiting to be sent')).toBeVisible();
	expect(api.withdrawals).toEqual([]);

	api.unreachable = false;
	await context.setOffline(false);
	await expect.poll(() => api.withdrawals.length).toBe(1);
	expect(api.withdrawals[0]).toMatchObject({ p_code: '97531', p_amount: 2500 });
	expect(api.withdrawals[0]).not.toHaveProperty('p_point_id');
	await expect(page.getByText('New cash point added to the map. Thank you!')).toBeVisible();
});
