import { describe, expect, it } from 'vitest';
import { fillUssdTemplate, isValidUssdTemplate, ussdSegments, ussdTelHref } from './ussd.ts';

describe('ussdSegments', () => {
	it('splits the templates into fixed text and blanks', () => {
		expect(ussdSegments('*126*16*{code}*{amount}#')).toEqual([
			{ kind: 'text', value: '*126*16*' },
			{ kind: 'code' },
			{ kind: 'text', value: '*' },
			{ kind: 'amount' },
			{ kind: 'text', value: '#' }
		]);
		expect(ussdSegments('#150*14*{code}*{amount}#')[0]).toEqual({ kind: 'text', value: '#150*14*' });
	});

	it('returns nothing for a malformed template', () => {
		expect(ussdSegments('*126*{code}#')).toEqual([]);
	});
});

describe('fillUssdTemplate', () => {
	it.each([
		['*126*16*{code}*{amount}#', '*126*16*123456*5000#'],
		['#150*14*{code}*{amount}#', '#150*14*123456*5000#']
	])('fills %s', (template, expected) => {
		expect(fillUssdTemplate(template, '123456', 5000)).toBe(expected);
	});

	it.each([
		'*126*16*{code}*{amount}',
		'126*{code}*{amount}#',
		'*126*{pin}*{code}*{amount}#',
		'*126*{code}*{code}#',
		'*126*{code}#',
		'tel:*126*{code}*{amount}#'
	])('refuses the malformed template %s', (template) => {
		expect(isValidUssdTemplate(template)).toBe(false);
		expect(() => fillUssdTemplate(template, '1234', 5000)).toThrow();
	});

	it('refuses codes and amounts that could change the USSD string', () => {
		const template = '*126*16*{code}*{amount}#';
		expect(() => fillUssdTemplate(template, '12*34', 5000)).toThrow();
		expect(() => fillUssdTemplate(template, '1234#', 5000)).toThrow();
		expect(() => fillUssdTemplate(template, '1234', 50.5)).toThrow();
		expect(() => fillUssdTemplate(template, '1234', -500)).toThrow();
	});
});

describe('ussdTelHref', () => {
	it('escapes # so the dialer receives the whole string', () => {
		expect(ussdTelHref('#150*14*123456*5000#')).toBe('tel:%23150*14*123456*5000%23');
		expect(ussdTelHref('*126*16*123456*5000#')).toBe('tel:*126*16*123456*5000%23');
	});
});
