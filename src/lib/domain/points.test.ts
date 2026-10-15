import { describe, expect, it } from 'vitest';
import { formatDistance, formatRelativeTime } from '../i18n/format.js';
import { matchesFilter, nearestPoints, parsePointsPage, parseSavedPoints, type CashPoint } from './points.js';

function row(overrides: Record<string, unknown> = {}) {
	return {
		id: '6f1c2a2e-2d1b-4c4f-9a57-3b8f0e9d1a01',
		network_id: 'mtn',
		code: '54321',
		lat: 4.0511,
		lng: 9.7679,
		accuracy_m: 12,
		withdrawal_count: 3,
		last_withdrawal_at: '2026-10-13T09:00:00.123456+00:00',
		status: 'active',
		updated_at: '2026-10-13T09:00:01.654321+00:00',
		...overrides
	};
}

function point(overrides: Partial<CashPoint> = {}): CashPoint {
	return {
		id: 'p',
		network: 'mtn',
		code: '54321',
		lat: 4.0511,
		lng: 9.7679,
		accuracyM: 10,
		withdrawalCount: 1,
		lastWithdrawalAt: null,
		updatedAt: '2026-10-13T09:00:00+00:00',
		...overrides
	};
}

describe('parsePointsPage', () => {
	it('maps valid rows and remembers the last row as the sync cursor', () => {
		const page = parsePointsPage([row(), row({ id: '7f1c2a2e-2d1b-4c4f-9a57-3b8f0e9d1a02', status: 'hidden' })]);

		expect(page.active).toEqual([
			{
				id: '6f1c2a2e-2d1b-4c4f-9a57-3b8f0e9d1a01',
				network: 'mtn',
				code: '54321',
				lat: 4.0511,
				lng: 9.7679,
				accuracyM: 12,
				withdrawalCount: 3,
				lastWithdrawalAt: '2026-10-13T09:00:00.123456+00:00',
				updatedAt: '2026-10-13T09:00:01.654321+00:00'
			}
		]);
		expect(page.hiddenIds).toEqual(['7f1c2a2e-2d1b-4c4f-9a57-3b8f0e9d1a02']);
		expect(page.last).toEqual({ id: '7f1c2a2e-2d1b-4c4f-9a57-3b8f0e9d1a02', updatedAt: row().updated_at });
		expect(page.received).toBe(2);
	});

	it.each([{ code: '12ab' }, { lat: 91 }, { id: 'not-a-uuid' }, { status: 'deleted' }, { updated_at: 'yesterday' }])(
		'drops a malformed row (%j)',
		(overrides) => {
			const page = parsePointsPage([row(overrides)]);
			expect(page.active).toEqual([]);
			expect(page.rejected).toBe(1);
		}
	);

	it('tolerates a non-array response', () => {
		expect(parsePointsPage(null).received).toBe(0);
	});
});

describe('parseSavedPoints', () => {
	it('maps saved rows and drops malformed ones', () => {
		const { id, status, ...fields } = row();
		const saved = { point_id: id, saved_at: '2026-10-14T08:00:00+00:00', ...fields };

		const entries = parseSavedPoints([saved, { ...saved, point_id: 'nope' }, { ...saved, saved_at: null }]);

		expect(status).toBe('active');
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ savedAt: saved.saved_at, point: { id, code: '54321', withdrawalCount: 3 } });
		expect(parseSavedPoints({})).toEqual([]);
	});
});

describe('matchesFilter', () => {
	it('filters by network and by code prefix', () => {
		const mtn = point({ network: 'mtn', code: '54321' });
		expect(matchesFilter(mtn, { network: 'all', code: '' })).toBe(true);
		expect(matchesFilter(mtn, { network: 'orange', code: '' })).toBe(false);
		expect(matchesFilter(mtn, { network: 'mtn', code: '543' })).toBe(true);
		expect(matchesFilter(mtn, { network: 'all', code: '999' })).toBe(false);
	});
});

describe('nearestPoints', () => {
	it('orders points by distance and keeps the closest ones', () => {
		const origin = { lat: 4.0511, lng: 9.7679 };
		const far = point({ id: 'far', lat: 4.07 });
		const near = point({ id: 'near', lat: 4.052 });
		const middle = point({ id: 'middle', lat: 4.06 });

		const result = nearestPoints([far, near, middle], origin, 2);

		expect(result.map(({ point }) => point.id)).toEqual(['near', 'middle']);
		expect(result[0].distanceM).toBeGreaterThan(90);
		expect(result[0].distanceM).toBeLessThan(110);
	});
});

describe('formatting', () => {
	it('formats distances for each language', () => {
		expect(formatDistance(83, 'en')).toBe('80 m');
		expect(formatDistance(1234, 'en')).toBe('1.2 km');
		// French puts a narrow no-break space between number and unit.
		expect(formatDistance(1234, 'fr')).toBe('1,2\u202fkm');
		expect(formatDistance(23_400, 'en')).toBe('23 km');
	});

	it('formats relative times', () => {
		const now = Date.parse('2026-10-13T12:00:00Z');
		expect(formatRelativeTime('2026-10-13T10:00:00Z', 'en', now)).toBe('2 hours ago');
		expect(formatRelativeTime('2026-10-13T10:00:00Z', 'fr', now)).toBe('il y a 2 heures');
		expect(formatRelativeTime('2026-10-12T12:00:00Z', 'en', now)).toBe('yesterday');
	});
});
