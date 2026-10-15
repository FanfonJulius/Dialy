import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { session } from '#lib/stores/session.svelte.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	await session.init();
	const user = session.user;
	if (!user) redirect(307, resolve('/auth'));
	return { userId: user.id };
};
