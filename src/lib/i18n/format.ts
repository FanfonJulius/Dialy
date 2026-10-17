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

/** "654 57 19 14": a Cameroonian mobile number in the groups people read it in. */
export function formatPhoneNumber(number: string): string {
	return number.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})$/, '$1\u00a0$2\u00a0$3\u00a0$4');
}

/** "3 min", rounded to whole minutes and never below one. */
export function formatDuration(seconds: number, locale: string): string {
	return new Intl.NumberFormat(intlLocale(locale), { style: 'unit', unit: 'minute' }).format(
		Math.max(1, Math.round(seconds / 60))
	);
}

/** "17 Oct 2026, 14:30" / "17 oct. 2026, 14:30", in the phone's time zone. */
export function formatDateTime(iso: string, locale: string): string {
	return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

/** "850 kB", "12.5 MB" / "12,5 Mo". */
export function formatBytes(bytes: number, locale: string): string {
	const megabytes = bytes / 1_000_000;
	const [value, unit] = megabytes >= 1 ? [megabytes, 'megabyte'] : [Math.max(1, bytes / 1000), 'kilobyte'];
	return new Intl.NumberFormat(intlLocale(locale), {
		style: 'unit',
		unit,
		maximumFractionDigits: value < 10 ? 1 : 0
	}).format(value);
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
