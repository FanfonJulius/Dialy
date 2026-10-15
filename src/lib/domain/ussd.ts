// Mirrors the ussd_templates check constraint: only digits, * and # around {code} and {amount}.
const TEMPLATE_SHAPE = /^[*#][0-9*#]*\{(code|amount)\}[0-9*#]*\{(code|amount)\}[0-9*#]*#$/;

export function isValidUssdTemplate(template: string): boolean {
	const match = TEMPLATE_SHAPE.exec(template);
	return match !== null && match[1] !== match[2];
}

/** The USSD string the user dials, e.g. `*126*16*123456*5000#`. */
export function fillUssdTemplate(template: string, code: string, amount: number): string {
	if (!isValidUssdTemplate(template)) throw new Error('Invalid USSD template');
	if (!/^\d+$/.test(code)) throw new Error('Agent codes are digits only');
	if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Amounts are positive whole numbers');
	return template.replace('{code}', code).replace('{amount}', String(amount));
}

/** `tel:` link that opens the phone dialer with the USSD string typed in (# must be escaped). */
export function ussdTelHref(ussd: string): string {
	return `tel:${ussd.replaceAll('#', '%23')}`;
}
