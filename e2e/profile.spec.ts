import { expect, test, type Locator, type Page } from '@playwright/test';
import { FakeSupabase } from './fake-supabase';

const BASE_FONT_PX = 16;
const MIN_FONT_PX = 11;

async function openProfileAs(page: Page, email: string): Promise<FakeSupabase> {
	const api = new FakeSupabase();
	api.user = { ...api.user, email };
	await api.install(page);
	await api.signInBeforeLoad(page);
	await page.goto('/profile');
	return api;
}

/** Where the email sits relative to the account card, and how it is drawn. */
function measure(email: Locator) {
	return email.evaluate((node) => {
		const card = node.closest('section')!.getBoundingClientRect();
		const box = node.getBoundingClientRect();
		const range = document.createRange();
		range.selectNodeContents(node);
		return {
			fontPx: parseFloat(getComputedStyle(node).fontSize),
			lines: range.getClientRects().length,
			overflowPx: node.scrollWidth - node.clientWidth,
			insideCard: box.left >= card.left && box.right <= card.right
		};
	});
}

test('a short email is shown at full size', async ({ page }) => {
	const api = await openProfileAs(page, 'ama@example.com');
	const email = page.getByText('ama@example.com', { exact: true });

	await expect(page.getByText('Signed in as')).toBeVisible();
	expect(await measure(email)).toEqual({ fontPx: BASE_FONT_PX, lines: 1, overflowPx: 0, insideCard: true });
	expect(api.unexpected).toEqual([]);
});

test('a long email gets smaller to fit the account card on one line', async ({ page }) => {
	const address = 'aminata.ngono.fotso.ndjock@entreprise-exemple.cm';
	const api = await openProfileAs(page, address);
	const email = page.getByText(address, { exact: true });

	await expect(email).toBeVisible();
	const drawn = await measure(email);
	expect(drawn.fontPx).toBeLessThan(BASE_FONT_PX);
	expect(drawn.fontPx).toBeGreaterThanOrEqual(MIN_FONT_PX);
	expect(drawn).toMatchObject({ lines: 1, overflowPx: 0, insideCard: true });
	expect(api.unexpected).toEqual([]);
});

test('an extremely long email wraps at the smallest size instead of leaving the card', async ({ page }) => {
	const address = `${'very.long.name.'.repeat(8)}end@an-extremely-long-company-domain-name.example.com`;
	const api = await openProfileAs(page, address);
	const email = page.getByText(address, { exact: true });

	await expect(email).toBeVisible();
	const drawn = await measure(email);
	expect(drawn).toMatchObject({ fontPx: MIN_FONT_PX, overflowPx: 0, insideCard: true });
	expect(drawn.lines).toBeGreaterThan(1);
	expect(api.unexpected).toEqual([]);
});
