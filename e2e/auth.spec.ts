import { expect, test } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

test('a new visitor creates an account, goes through onboarding and reaches the map', async ({ page }) => {
	const api = new FakeSupabase();
	await api.install(page);

	await page.goto('/');
	await expect(page).toHaveURL(/\/auth$/);

	await page.getByRole('tab', { name: 'Create account' }).click();
	await page.getByLabel('Email').fill('new.user@example.com');
	await page.getByLabel('Password', { exact: true }).fill('abc12345');
	await page.locator('form').getByRole('button', { name: 'Create account' }).click();

	await expect(page).toHaveURL(/\/onboarding$/);
	await page.getByRole('button', { name: 'Next' }).click();
	// Location was already allowed in this browser, so onboarding does not ask again.
	await expect(page.getByText('Location is on.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Allow location' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Next' }).click();
	await page.getByRole('button', { name: 'Get started' }).click();

	await expect(page.getByRole('region', { name: 'Nearby' })).toBeVisible();
	expect(api.unexpected).toEqual([]);
});

test('wrong credentials are explained, and signing out returns to sign-in', async ({ page }) => {
	const api = new FakeSupabase();
	await api.install(page);

	await page.goto('/auth');
	await page.getByLabel('Email').fill(api.user.email);
	await page.getByLabel('Password', { exact: true }).fill('wrong-password1');
	await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');

	await page.getByLabel('Password', { exact: true }).fill(api.user.password);
	await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
	// A device that has never been used with this account shows the onboarding first.
	await expect(page).toHaveURL(/\/onboarding$/);
	for (const step of ['Next', 'Next', 'Get started']) await page.getByRole('button', { name: step }).click();
	await expect(page.getByRole('region', { name: 'Nearby' })).toBeVisible();

	await page.getByRole('link', { name: 'Profile' }).click();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(/\/auth$/);
	await page.goto('/saved');
	await expect(page).toHaveURL(/\/auth$/);
});

test('a signed-in user stays signed in after reloading or reopening the app', async ({ page, context }) => {
	const api = new FakeSupabase();
	await api.install(page);

	await page.goto('/auth');
	await page.getByLabel('Email').fill(api.user.email);
	await page.getByLabel('Password', { exact: true }).fill(api.user.password);
	await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
	for (const step of ['Next', 'Next', 'Get started']) await page.getByRole('button', { name: step }).click();
	await expect(page.getByRole('region', { name: 'Nearby' })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('region', { name: 'Nearby' })).toBeVisible();

	await page.close();
	const reopened = await context.newPage();
	await reopened.goto('/');
	await expect(reopened.getByRole('region', { name: 'Nearby' })).toBeVisible();
	await expect(reopened).toHaveURL(/\/$/);
	expect(api.unexpected).toEqual([]);
});

test('onboarding is shown once per account, even on a new phone or browser', async ({ page }) => {
	const api = new FakeSupabase();
	api.profile = { onboarded_at: '2026-10-01T08:00:00.000Z', privacy_version: 1 };
	await api.install(page);

	await page.goto('/auth');
	await page.getByLabel('Email').fill(api.user.email);
	await page.getByLabel('Password', { exact: true }).fill(api.user.password);
	await page.locator('form').getByRole('button', { name: 'Sign in' }).click();

	await expect(page.getByRole('region', { name: 'Nearby' })).toBeVisible();
	await expect(page).toHaveURL(/\/$/);
	await page.goto('/onboarding');
	await expect(page).toHaveURL(/\/$/);
	expect(api.unexpected).toEqual([]);
});
