import { expect, test, type Page } from '@playwright/test';
import { FakeSupabase, HERE } from './fake-supabase';

let api: FakeSupabase;

/** Agents beyond the Nearby radius (100 m) are reached by searching their code. */
async function searchAgent(page: Page, code: string): Promise<void> {
	await page.getByRole('textbox', { name: 'Search by agent code' }).fill(code);
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.locator('#point-code')).toHaveText(code);
}

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
	await searchAgent(page, '24680');

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

test('a new agent dialed before the phone has a precise position is added as soon as it has one', async ({
	page,
	context
}) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Orange Money 13579/ })).toBeVisible();
	// Indoors, right after opening the app: only a rough, network-based position.
	await context.setGeolocation({ ...HERE, accuracy: 600 });
	await page.waitForTimeout(1200); // a new fix is taken into account once a second

	await page.getByRole('button', { name: 'Withdraw' }).click();
	await page.getByRole('textbox', { name: 'Agent code', exact: true }).fill('86420');
	await page.getByLabel('Amount (FCFA)').fill('3000');
	await page.getByRole('button', { name: 'Dial' }).click();

	// Not sent yet, and not lost: the withdrawal waits for a position good enough to place the agent.
	await expect(page.getByText('1 changes waiting to be sent')).toBeVisible();
	expect(api.withdrawals).toEqual([]);

	await context.setGeolocation({ ...HERE, accuracy: 15 });

	await expect.poll(() => api.withdrawals.length).toBe(1);
	expect(api.withdrawals[0]).toMatchObject({
		p_code: '86420',
		p_lat: HERE.latitude,
		p_lng: HERE.longitude,
		p_accuracy_m: 15
	});
	await expect(page.getByText('New cash point added to the map. Thank you!')).toBeVisible();
	// On the map for everyone: the app opened afresh lists the new agent nearby.
	const later = await page.context().newPage();
	await api.signInBeforeLoad(later);
	await later.goto('/');
	await expect(later.getByRole('region', { name: 'Nearby' }).getByRole('button', { name: /86420/ })).toBeVisible();
});

test('leaving Daily (e.g. for the dialer) lets go of the field typed in, so it reopens without the keyboard', async ({
	page
}) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Orange Money 13579/ }).click();
	const amount = page.getByLabel('Amount (FCFA)');
	await amount.fill('5000');
	await expect(amount).toBeFocused();

	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
		document.dispatchEvent(new Event('visibilitychange'));
	});

	await expect(amount).not.toBeFocused();
	await expect(amount).toHaveValue('5000');
});
