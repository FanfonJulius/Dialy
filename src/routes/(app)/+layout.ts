import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { session } from '#lib/stores/session.svelte.js';
import { hasOnboarded } from '#lib/stores/onboarding.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async () => {
	await session.init();
	const user = session.user;
	if (!user) redirect(307, resolve('/auth'));
	if (!(await hasOnboarded(user.id))) redirect(307, resolve('/onboarding'));
};
