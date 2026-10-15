const COUNTRY = 'CM';
const KILOMETRE = 1000;

function intlLocale(locale: string): string {
	return `${locale}-${COUNTRY}`;
}

/** "80 m", "1.2 km" / "1,2 km". */
export function formatDistance(meters: number, locale: string): string {
	if (meters < KILOMETRE) {
		const rounded = Math.max(10, Math.round(meters / 10) * 10);
		return new Intl.NumberFormat(intlLocale(locale), { style: 'unit', unit: 'meter' }).format(rounded);
	}
	return new Intl.NumberFormat(intlLocale(locale), {
		style: 'unit',
		unit: 'kilometer',
		maximumFractionDigits: meters < 10 * KILOMETRE ? 1 : 0
	}).format(meters / KILOMETRE);
}

/** "FCFA 5,000" / "5 000 FCFA". */
export function formatAmount(amount: number, locale: string): string {
	return new Intl.NumberFormat(intlLocale(locale), {
		style: 'currency',
		currency: 'XAF',
		maximumFractionDigits: 0
	}).format(amount);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 3600],
	['month', 30 * 24 * 3600],
	['week', 7 * 24 * 3600],
	['day', 24 * 3600],
	['hour', 3600],
	['minute', 60]
];

/** "5 minutes ago", "yesterday", "il y a 2 heures". */
export function formatRelativeTime(iso: string, locale: string, now = Date.now()): string {
	const seconds = Math.round((Date.parse(iso) - now) / 1000);
	const format = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto' });
	for (const [unit, size] of UNITS) {
		if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
	}
	return format.format(0, 'minute');
}
