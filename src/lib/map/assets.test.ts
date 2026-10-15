import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAP_ASSET_PATHS } from './assets.js';

const STATIC_DIR = fileURLToPath(new URL('../../../static', import.meta.url));

describe('MAP_ASSET_PATHS', () => {
	it.each(MAP_ASSET_PATHS)('exists in static/: %s', (path) => {
		expect(existsSync(`${STATIC_DIR}${path}`)).toBe(true);
	});
});
