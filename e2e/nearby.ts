import { expect, type Page } from '@playwright/test';

/** Opens the Nearby list, which is closed when Daily opens so the map comes first. Does nothing if it is open. */
export async function openNearby(page: Page): Promise<void> {
	const toggle = page.getByRole('region', { name: 'Nearby' }).getByRole('button', { name: /Show the list|Hide the list/ });
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}
