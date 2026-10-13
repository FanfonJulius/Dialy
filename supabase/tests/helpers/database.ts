import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

// The parts of a Supabase database that the migrations rely on, including its permissive
// default grants, so tests prove that our own REVOKEs and RLS policies do the protecting.
const SUPABASE_BOOTSTRAP = `
	create role anon nologin noinherit;
	create role authenticated nologin noinherit;
	create role service_role nologin noinherit bypassrls;

	create schema extensions;
	create schema auth;
	create schema storage;

	create table auth.users (
		id uuid primary key,
		email text,
		created_at timestamptz not null default now()
	);

	create function auth.uid() returns uuid language sql stable as $$
		select coalesce(
			nullif(current_setting('request.jwt.claim.sub', true), ''),
			(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
		)::uuid
	$$;

	create table storage.buckets (
		id text primary key,
		name text not null,
		public boolean default false,
		created_at timestamptz default now()
	);

	grant usage on schema public, extensions, auth to anon, authenticated, service_role;
	alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
	alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
	alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export type LatLng = { lat: number; lng: number };

export const DOUALA: LatLng = { lat: 4.0511, lng: 9.7679 };
export const YAOUNDE: LatLng = { lat: 3.848, lng: 11.5021 };

const METERS_PER_DEGREE_LAT = 110_600;

/** Approximate point `north` / `east` metres away (good enough for the radii under test). */
export function offsetMeters(origin: LatLng, north: number, east = 0): LatLng {
	const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
	return { lat: origin.lat + north / METERS_PER_DEGREE_LAT, lng: origin.lng + east / metersPerDegreeLng };
}

export async function createTestDatabase(): Promise<PGlite> {
	const db = await PGlite.create({ extensions: { postgis } });
	await db.exec(SUPABASE_BOOTSTRAP);
	const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
	for (const file of files) {
		await db.exec(await readFile(`${MIGRATIONS_DIR}${file}`, 'utf8'));
	}
	return db;
}

export async function createUser(db: PGlite, email: string): Promise<string> {
	const id = randomUUID();
	await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
	return id;
}

/** Switches the current transaction to a signed-in user (or anon when `userId` is null). */
export async function actAs(db: PGlite, userId: string | null): Promise<void> {
	await db.exec('reset role');
	const claims = userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' };
	await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
	await db.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
}

/** Switches the current transaction back to the database owner (bypasses RLS). */
export async function actAsAdmin(db: PGlite): Promise<void> {
	await db.exec('reset role');
	await db.query(`select set_config('request.jwt.claims', '', true)`);
}

export type Attempt<T> = { rows: T[]; error: Error | null };

/** Runs a statement inside a savepoint so an expected error doesn't abort the test transaction. */
export async function attempt<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<Attempt<T>> {
	await db.exec('savepoint attempt');
	try {
		const result = await db.query<T>(sql, params);
		await db.exec('release savepoint attempt');
		return { rows: result.rows, error: null };
	} catch (error) {
		await db.exec('rollback to savepoint attempt');
		return { rows: [], error: error instanceof Error ? error : new Error(String(error)) };
	}
}
