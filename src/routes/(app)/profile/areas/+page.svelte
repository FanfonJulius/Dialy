<script lang="ts">
	import { resolve } from '$app/paths';
	import AreaList from '#lib/features/areas/AreaList.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<section class="mx-auto flex w-full max-w-md flex-1 flex-col p-4">
	<a href={resolve('/(app)/profile')} class="mb-2 self-start text-sm font-medium text-primary-ink">← {m.profile_title()}</a>
	<h1 class="mb-6 text-2xl font-bold text-fg">{m.areas_title()}</h1>
	<AreaList />
</section>
