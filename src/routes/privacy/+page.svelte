<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';

	const sections = [
		{ title: m.privacy_collect_title, body: m.privacy_collect_body },
		{ title: m.privacy_public_title, body: m.privacy_public_body },
		{ title: m.privacy_location_title, body: m.privacy_location_body },
		{ title: m.privacy_pin_title, body: m.privacy_pin_body },
		{ title: m.privacy_delete_title, body: m.privacy_delete_body }
	] as const;
</script>

<main class="mx-auto flex w-full max-w-md flex-col gap-5 p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
	<!-- The app root sends visitors on to sign-in or onboarding as needed. -->
	<a href={resolve('/(app)')} class="self-start text-sm font-medium text-primary-ink">
		← {m.privacy_back()}
	</a>
	<h1 class="text-2xl font-bold text-fg">{m.privacy_title()}</h1>
	<p class="text-fg-muted">{m.privacy_intro()}</p>
	{#each sections as section (section.title)}
		<section class="flex flex-col gap-1.5">
			<h2 class="text-lg font-semibold text-fg">{section.title()}</h2>
			<p class="leading-relaxed text-fg-muted">{section.body()}</p>
		</section>
	{/each}
</main>
