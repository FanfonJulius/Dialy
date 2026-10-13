import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function messages(locale: string): Record<string, string> {
	const raw = JSON.parse(readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8'));
	delete raw.$schema;
	return raw;
}

const en = messages('en');
const fr = messages('fr');

describe('translations', () => {
	it('define the same keys in English and French', () => {
		expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
	});

	it.each(Object.entries({ en, fr }))('has no empty %s message', (_locale, values) => {
		const empty = Object.entries(values).filter(([, value]) => value.trim() === '');
		expect(empty).toEqual([]);
	});
});
