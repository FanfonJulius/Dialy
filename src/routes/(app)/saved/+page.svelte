<script lang="ts">
	import SavedList from '#lib/features/saved/SavedList.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<section class="mx-auto flex w-full max-w-md flex-1 flex-col p-4">
	<h1 class="mb-6 text-2xl font-bold text-fg">{m.nav_saved()}</h1>
	<SavedList />
</section>
