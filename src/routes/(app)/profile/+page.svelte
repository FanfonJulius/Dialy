<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import LanguageSwitcher from '#lib/features/profile/LanguageSwitcher.svelte';
	import ThemeSwitcher from '#lib/features/profile/ThemeSwitcher.svelte';
</script>

<section class="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
	<h1 class="text-2xl font-bold text-fg">{m.profile_title()}</h1>
	<div class="flex flex-col gap-6 rounded-2xl bg-surface p-4">
		<LanguageSwitcher />
		<ThemeSwitcher />
	</div>
</section>
