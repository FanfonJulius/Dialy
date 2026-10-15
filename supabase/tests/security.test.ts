import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	DOUALA,
	actAs,
	actAsAdmin,
	attempt,
	createTestDatabase,
	createUser
} from './helpers/database.js';

let db: PGlite;
let alice: string;
let bob: string;

beforeAll(async () => {
	db = await createTestDatabase();
	alice = await createUser(db, 'alice@example.com');
	bob = await createUser(db, 'bob@example.com');
});

afterAll(async () => {
	await db.close();
});

beforeEach(async () => {
	await db.exec('begin');
});

afterEach(async () => {
	await db.exec('rollback');
});

async function createPoint(userId: string, code = '54321'): Promise<string> {
	await actAs(db, userId);
	const { rows } = await db.query<{ point_id: string }>(
		`select point_id from public.record_withdrawal(
			p_client_uuid => $1, p_network_id => 'mtn', p_code => $2, p_amount => 5000,
			p_lat => $3, p_lng => $4, p_accuracy_m => 15)`,
		[randomUUID(), code, DOUALA.lat, DOUALA.lng]
	);
	return rows[0].point_id;
}

function expectPermissionDenied(error: Error | null): void {
	expect(error?.message).toMatch(/permission denied/);
}

describe('anonymous users', () => {
	it.each(['networks', 'ussd_templates', 'points', 'withdrawals', 'saved_points', 'profiles'])(
		'cannot read %s',
		async (table) => {
			await actAs(db, null);
			expectPermissionDenied((await attempt(db, `select * from public.${table}`)).error);
		}
	);

	it.each([
		'select * from public.points_in_bbox(9.7, 4.0, 9.8, 4.1)',
		'select * from public.nearby_points(4.05, 9.76)',
		`select * from public.record_withdrawal('${randomUUID()}', 'mtn', '54321', 5000, 4.05, 9.76, 10)`,
		'select public.delete_my_account()',
		'select * from public.my_saved_points()'
	])('cannot call %s', async (sql) => {
		await actAs(db, null);
		expectPermissionDenied((await attempt(db, sql)).error);
	});
});

describe('public data', () => {
	it('lets signed-in users read networks and USSD templates', async () => {
		await actAs(db, alice);
		const networks = await db.query('select id, min_amount, max_amount, code_pattern from public.networks order by sort_order');
		const templates = await db.query(
			'select network_id, template from public.ussd_templates where active order by network_id'
		);

		expect(networks.rows).toEqual([
			{ id: 'mtn', min_amount: 500, max_amount: null, code_pattern: '^[0-9]{4,6}$' },
			{ id: 'orange', min_amount: 500, max_amount: null, code_pattern: '^[0-9]{4,6}$' }
		]);
		expect(templates.rows).toEqual([
			{ network_id: 'mtn', template: '*126*16*{code}*{amount}#' },
			{ network_id: 'orange', template: '#150*14*{code}*{amount}#' }
		]);
	});

	it('never stores who withdrew on a point', async () => {
		const { rows } = await db.query<{ column_name: string }>(
			`select column_name from information_schema.columns
			  where table_schema = 'public' and table_name = 'points' order by column_name`
		);

		expect(rows.map((row) => row.column_name)).toEqual([
			'accuracy_m',
			'code',
			'created_at',
			'id',
			'last_withdrawal_at',
			'location',
			'network_id',
			'status',
			'updated_at',
			'withdrawal_count'
		]);
	});

	it('lets another user read a point created by someone else', async () => {
		const pointId = await createPoint(alice);
		await actAs(db, bob);

		const { rows } = await db.query('select code from public.points where id = $1', [pointId]);
		expect(rows).toEqual([{ code: '54321' }]);
	});
});

describe('writes outside record_withdrawal', () => {
	it.each([
		`insert into public.points (network_id, code, location, accuracy_m)
		 values ('mtn', '54321', extensions.st_makepoint(9.7, 4.0)::extensions.geography, 5)`,
		`update public.points set withdrawal_count = 999`,
		`delete from public.points`,
		`insert into public.withdrawals (client_uuid, user_id, point_id, amount, captured_at)
		 values (gen_random_uuid(), auth.uid(), gen_random_uuid(), 5000, now())`,
		`update public.networks set min_amount = 1`,
		`insert into public.ussd_templates (network_id, template) values ('mtn', '*1*{code}*{amount}#')`
	])('are refused: %s', async (sql) => {
		await createPoint(alice);
		await actAs(db, alice);
		expectPermissionDenied((await attempt(db, sql)).error);
	});
});

describe('private data', () => {
	it('shows withdrawals only to the user who made them', async () => {
		await createPoint(alice);

		await actAs(db, alice);
		expect((await db.query('select id from public.withdrawals')).rows).toHaveLength(1);
		await actAs(db, bob);
		expect((await db.query('select id from public.withdrawals')).rows).toHaveLength(0);
	});

	it('keeps saved points per user and idempotent', async () => {
		const pointId = await createPoint(alice);

		await actAs(db, alice);
		const save = 'insert into public.saved_points (point_id) values ($1) on conflict do nothing';
		await db.query(save, [pointId]);
		await db.query(save, [pointId]);
		expect((await db.query('select point_id from public.saved_points')).rows).toEqual([{ point_id: pointId }]);

		await actAs(db, bob);
		expect((await db.query('select * from public.saved_points')).rows).toHaveLength(0);
		const forged = await attempt(db, 'insert into public.saved_points (user_id, point_id) values ($1, $2)', [
			alice,
			pointId
		]);
		expect(forged.error?.message).toMatch(/row-level security/);
		await db.query('delete from public.saved_points where point_id = $1', [pointId]);

		await actAs(db, alice);
		expect((await db.query('select * from public.saved_points')).rows).toHaveLength(1);
	});

	it('lists only the caller\'s saved points, with their details, newest first', async () => {
		const first = await createPoint(alice, '11111');
		const second = await createPoint(bob, '22222');
		await actAs(db, alice);
		await db.query('insert into public.saved_points (point_id, created_at) values ($1, now() - interval \'1 hour\')', [first]);
		await db.query('insert into public.saved_points (point_id) values ($1)', [second]);

		const { rows } = await db.query<{ point_id: string; code: string; lat: number; lng: number }>(
			'select point_id, code, lat, lng from public.my_saved_points()'
		);
		expect(rows.map((row) => row.code)).toEqual(['22222', '11111']);
		expect(rows[0].lat).toBeCloseTo(DOUALA.lat, 5);
		expect(rows[0].lng).toBeCloseTo(DOUALA.lng, 5);

		await actAs(db, bob);
		expect((await db.query('select * from public.my_saved_points()')).rows).toHaveLength(0);
	});

	it('leaves hidden points out of the saved list', async () => {
		const pointId = await createPoint(alice);
		await actAs(db, alice);
		await db.query('insert into public.saved_points (point_id) values ($1)', [pointId]);
		await actAsAdmin(db);
		await db.query(`update public.points set status = 'hidden' where id = $1`, [pointId]);

		await actAs(db, alice);
		expect((await db.query('select * from public.my_saved_points()')).rows).toHaveLength(0);
	});

	it('creates a profile on sign-up that only its owner can read and change', async () => {
		await actAs(db, alice);
		const before = await db.query<{ updated_at: Date }>('select updated_at from public.profiles');
		await db.query(`update public.profiles set theme = 'dark', locale = 'fr' where id = auth.uid()`);
		const after = await db.query<{ theme: string; locale: string; updated_at: Date }>(
			'select theme, locale, updated_at from public.profiles'
		);

		expect(after.rows[0]).toMatchObject({ theme: 'dark', locale: 'fr' });
		expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
		expectPermissionDenied((await attempt(db, `update public.profiles set id = $1`, [bob])).error);

		await actAs(db, bob);
		expect((await db.query('select * from public.profiles where id = $1', [alice])).rows).toHaveLength(0);
		const update = await db.query(`update public.profiles set theme = 'light' where id = $1`, [alice]);
		expect(update.affectedRows).toBe(0);
	});
});

describe('internal helpers', () => {
	it('cannot be called through the API roles', async () => {
		await actAs(db, alice);
		expectPermissionDenied((await attempt(db, 'select private.make_location(4.0, 9.7)')).error);
	});
});

describe('delete_my_account', () => {
	it('removes the user and their private data but keeps public points', async () => {
		const pointId = await createPoint(alice);
		await actAs(db, alice);
		await db.query('insert into public.saved_points (point_id) values ($1)', [pointId]);

		await db.query('select public.delete_my_account()');

		await actAsAdmin(db);
		const remaining = await db.query<{ users: number; withdrawals: number; saved: number; profiles: number }>(
			`select (select count(*)::int from auth.users where id = $1) as users,
			        (select count(*)::int from public.withdrawals where user_id = $1) as withdrawals,
			        (select count(*)::int from public.saved_points where user_id = $1) as saved,
			        (select count(*)::int from public.profiles where id = $1) as profiles`,
			[alice]
		);
		expect(remaining.rows[0]).toEqual({ users: 0, withdrawals: 0, saved: 0, profiles: 0 });
		const point = await db.query('select withdrawal_count from public.points where id = $1', [pointId]);
		expect(point.rows).toEqual([{ withdrawal_count: 1 }]);
	});
});

describe('reference data constraints', () => {
	it.each([
		'*126*16*{code}*{amount}',
		'*126*{pin}*{code}*{amount}#',
		'*126*16*{amount}#',
		'tel:*126*{code}*{amount}#'
	])('rejects the USSD template %s', async (template) => {
		await actAsAdmin(db);
		const { error } = await attempt(
			db,
			`insert into public.ussd_templates (network_id, template, active) values ('mtn', $1, false)`,
			[template]
		);
		expect(error?.message).toMatch(/check constraint/);
	});

	it('rejects invalid code patterns', async () => {
		await actAsAdmin(db);
		const { error } = await attempt(db, `update public.networks set code_pattern = '^[0-9' where id = 'mtn'`);
		expect(error?.message).toMatch(/regular expression/);
	});
});
