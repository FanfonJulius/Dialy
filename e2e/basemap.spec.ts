import { inflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { FakeSupabase, ONLINE_MAP_COLORS } from './fake-supabase';

// The check for Daily's own map tiles gives up after 8 s; showing the map sooner proves it did not wait.
const SOONER_THAN_THE_CHECK_MS = 7_000;

/** The colour of one CSS pixel of the page, read from a 1×1 screenshot. */
async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
	const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 }, scale: 'css' });
	const data: Buffer[] = [];
	for (let offset = 8; offset < png.length; ) {
		const length = png.readUInt32BE(offset);
		if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') data.push(png.subarray(offset + 8, offset + 8 + length));
		offset += 12 + length;
	}
	// A single pixel: a filter byte (which leaves a lone pixel unchanged), then red, green and blue.
	return [...inflateSync(Buffer.concat(data)).subarray(1, 4)];
}

/** Whether the online map is drawn, judged on a part of the map with no point, button or panel over it. */
async function showsOnlineMap(page: Page, scheme: keyof typeof ONLINE_MAP_COLORS): Promise<boolean> {
	const expected = ONLINE_MAP_COLORS[scheme].match(/[\da-f]{2}/g)!.map((channel) => parseInt(channel, 16));
	const actual = await pixelAt(page, 40, 300);
	return actual.every((value, index) => Math.abs(value - expected[index]) <= 8);
}

let api: FakeSupabase;

test.beforeEach(async ({ page }) => {
	api = new FakeSupabase();
	await api.install(page);
	await api.signInBeforeLoad(page);
});

test.afterEach(() => {
	expect(api.unexpected).toEqual([]);
});

test('the online map does not wait to hear whether Daily has map tiles of its own (dark mode)', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	// A server slow to say whether Daily's own map tiles are published, as on a weak signal.
	api.manifestHangs = true;

	await page.goto('/');

	await expect.poll(() => showsOnlineMap(page, 'dark'), { timeout: SOONER_THAN_THE_CHECK_MS }).toBe(true);
});

test('an online map that could not load is tried again without reopening Daily', async ({ page }) => {
	// Offline or a weak signal at first.
	api.onlineMapFailures = 2;
	await page.goto('/');

	await expect.poll(() => showsOnlineMap(page, 'light'), { timeout: 20_000 }).toBe(true);
});
