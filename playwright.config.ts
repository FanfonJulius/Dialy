import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = Boolean(process.env.CI);

export default defineConfig({
	testDir: 'e2e',
	timeout: 60_000,
	expect: { timeout: 10_000 },
	retries: CI ? 2 : 0,
	workers: 1,
	reporter: CI ? 'github' : 'list',
	use: {
		...devices['Pixel 7'],
		// Locally the installed Edge is used, so no browser download is needed; CI installs Chromium.
		channel: CI ? undefined : 'msedge',
		baseURL: `http://localhost:${PORT}`,
		geolocation: { latitude: 3.8667, longitude: 11.5167, accuracy: 20 },
		permissions: ['geolocation'],
		locale: 'en-US',
		serviceWorkers: 'block',
		trace: 'retain-on-failure'
	},
	webServer: {
		command: `npm run build:e2e && npx vite preview --mode e2e --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !CI,
		timeout: 240_000
	}
});
