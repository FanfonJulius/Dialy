import { randomUUID } from 'node:crypto';
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

/** A withdrawal the user made earlier at the first agent, possibly the one that put it on the map. */
function withdrewAtFirstAgent(createdPoint: boolean): void {
	api.history.push({
		client_uuid: randomUUID(),
		amount: 5000,
		captured_at: '2026-10-15T09:30:00+00:00',
		point_id: api.points[0].id,
		created_point: createdPoint
	});
}

test('whoever added a point can take it off the map for everyone', async ({ page }) => {
	withdrewAtFirstAgent(true);
	const [point] = api.points;
	await page.goto('/');

	await page.getByRole('button', { name: /Orange Money 13579/ }).click();
	await expect(page.getByText('You added this point.')).toBeVisible();
	await page.getByRole('button', { name: 'Delete point' }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete point 13579?' });
	await expect(confirm.getByText('It will be removed from the map for everyone.', { exact: false })).toBeVisible();
	await confirm.getByRole('button', { name: 'Delete for everyone' }).click();

	await expect(page.getByText('Point deleted. Nobody will see it on the map anymore.')).toBeVisible();
	await expect(page.getByRole('region', { name: 'Nearby' }).getByRole('button', { name: /13579/ })).toHaveCount(0);
	await expect.poll(() => point.status).toBe('hidden');
});

test('nobody else can delete a point, not even people who withdrew there', async ({ page }) => {
	withdrewAtFirstAgent(false);
	await page.goto('/history');
	// The account's history (which says who added what) is on this phone now.
	await expect(page.getByText('13579')).toBeVisible();

	await page.getByRole('link', { name: 'Back to the map' }).click();
	await page.getByRole('button', { name: /Orange Money 13579/ }).click();

	await expect(page.locator('#point-code')).toHaveText('13579');
	await expect(page.getByRole('button', { name: 'Delete point' })).toHaveCount(0);
});
