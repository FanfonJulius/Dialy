import { expect, test } from '@playwright/test';
import { FakeSupabase, HERE } from './fake-supabase';

// A walk of about 234 m: north along one street, then east to the MTN agent 24680.
const START = [HERE.longitude, HERE.latitude];
const CORNER = [11.5167, 3.868];
const AGENT = [11.5175, 3.868];
const ROUTE = {
	code: 'Ok',
	routes: [{ distance: 234, duration: 180, geometry: { type: 'LineString', coordinates: [START, CORNER, AGENT] } }]
};

let api: FakeSupabase;

test.beforeEach(async ({ page }) => {
	api = new FakeSupabase();
	await api.install(page);
	await api.signInBeforeLoad(page);
});

test.afterEach(() => {
	expect(api.unexpected).toEqual([]);
});

test('a far point gets a walking route that shrinks as the user walks, until arrival', async ({ page, context }) => {
	const requests: string[] = [];
	await context.route('https://routing.openstreetmap.de/**', (route) => {
		requests.push(route.request().url());
		return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROUTE) });
	});
	await page.goto('/');

	// A point a few steps away needs no directions.
	await page.getByRole('button', { name: /Orange Money 13579/ }).click();
	await expect(page.locator('#point-code')).toHaveText('13579');
	await expect(page.getByRole('button', { name: 'Directions' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Close' }).click();
	await page.getByRole('button', { name: /MTN MoMo 24680/ }).click();
	await page.getByRole('button', { name: 'Directions' }).click();

	await expect(page.getByText(/^230 m · 3 mins? on foot$/)).toBeVisible();
	expect(requests).toHaveLength(1);
	expect(requests[0]).toContain('/routed-foot/route/v1/foot/11.51670,3.86670;11.51750,3.86800?');
	await expect(page.getByRole('link', { name: 'Fix the map' })).toBeVisible();

	// Halfway up the first street: the part already walked is gone.
	await context.setGeolocation({ latitude: 3.8674, longitude: 11.5167 });
	await expect(page.getByText(/^160 m · 2 mins? on foot$/)).toBeVisible();

	// Positions closer than a second apart are ignored to save battery.
	await page.waitForTimeout(1100);
	await context.setGeolocation({ latitude: AGENT[1], longitude: AGENT[0] });
	await expect(page.getByText("You've arrived.")).toBeVisible();
	expect(requests).toHaveLength(1);

	// The banner opens the agent's card, ready to withdraw.
	await page.getByRole('button', { name: /MTN MoMo 24680/ }).first().click();
	await expect(page.locator('#point-code')).toHaveText('24680');
	await page.getByRole('button', { name: 'Stop directions' }).click();
	await expect(page.getByText("You've arrived.")).toBeHidden();
});

test('without a connection the way is shown as a straight line', async ({ page, context }) => {
	await context.route('https://routing.openstreetmap.de/**', (route) => route.abort('internetdisconnected'));
	await page.goto('/');

	await page.getByRole('button', { name: /MTN MoMo 24680/ }).click();
	await page.getByRole('button', { name: 'Directions' }).click();

	await expect(page.getByText(/^No walking route right now\. Straight line: 1\d0 m$/)).toBeVisible();
});
