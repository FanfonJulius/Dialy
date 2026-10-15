<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { geolocation, type LocationStatus } from '#lib/location/geolocation.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import { completeOnboarding } from '#lib/stores/onboarding.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const STEPS = [
		{ title: m.onboarding_nearby_title, body: m.onboarding_nearby_body },
		{ title: m.onboarding_location_title, body: m.onboarding_location_body },
		{ title: m.onboarding_pin_title, body: m.onboarding_pin_body }
	] as const;
	const LOCATION_STEP = 1;

	let step = $state(0);
	let locationStatus = $state<LocationStatus | null>(null);
	let busy = $state(false);
	const current = $derived(STEPS[step]);
	const isLast = $derived(step === STEPS.length - 1);

	// Permission given before (another visit, the browser settings): no need to ask again.
	onMount(async () => {
		try {
			const permission = await navigator.permissions?.query({ name: 'geolocation' });
			if (permission?.state === 'granted') locationStatus = 'active';
		} catch {
			// Permissions API unavailable: the button asks when tapped.
		}
	});

	async function allowLocation(): Promise<void> {
		busy = true;
		locationStatus = await geolocation.request();
		busy = false;
	}

	async function finish(): Promise<void> {
		busy = true;
		await completeOnboarding(data.userId);
		await goto(resolve('/(app)'), { replace: true });
	}
</script>

<main class="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
	<p class="text-sm font-medium text-fg-muted">
		{m.onboarding_step({ current: String(step + 1), total: String(STEPS.length) })}
	</p>

	<section class="flex flex-1 flex-col gap-4" aria-live="polite">
		<h1 class="text-2xl font-bold text-fg">{current.title()}</h1>
		<p class="text-base leading-relaxed text-fg-muted">{current.body()}</p>

		{#if step === LOCATION_STEP}
			{#if locationStatus === 'active'}
				<p class="text-sm font-medium text-success" role="status">{m.onboarding_location_granted()}</p>
			{:else if locationStatus === 'denied' || locationStatus === 'unsupported' || locationStatus === 'unavailable'}
				<p class="text-sm text-fg-muted" role="status">{m.onboarding_location_denied()}</p>
			{:else}
				<button
					type="button"
					class="self-start rounded-full border border-primary px-5 py-2.5 font-semibold text-primary-ink disabled:opacity-60"
					disabled={busy}
					onclick={allowLocation}
				>
					{m.onboarding_location_allow()}
				</button>
			{/if}
		{/if}

		<a href={resolve('/privacy')} class="mt-2 text-sm font-medium text-primary-ink underline">
			{m.onboarding_privacy_link()}
		</a>
	</section>

	<div class="flex gap-3 pb-[env(safe-area-inset-bottom)]">
		{#if step > 0}
			<button
				type="button"
				class="flex-1 rounded-full bg-surface-2 py-3.5 font-semibold text-fg"
				onclick={() => step--}
			>
				{m.onboarding_back()}
			</button>
		{/if}
		<button
			type="button"
			class="flex-1 rounded-full bg-primary py-3.5 font-semibold text-on-primary disabled:opacity-60"
			disabled={busy}
			onclick={() => (isLast ? finish() : step++)}
		>
			{isLast ? m.onboarding_finish() : m.onboarding_next()}
		</button>
	</div>
</main>
