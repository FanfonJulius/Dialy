<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
</script>

<section class="mx-auto flex w-full max-w-md flex-1 flex-col p-4">
	<h1 class="mb-6 text-2xl font-bold text-fg">{m.nav_saved()}</h1>
	<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
		<span class="rounded-full bg-surface-2 p-4 text-fg-muted">
			<Icon name="bookmark" class="size-8" />
		</span>
		<h2 class="text-lg font-semibold text-fg">{m.saved_empty_title()}</h2>
		<p class="max-w-xs text-fg-muted">{m.saved_empty_body()}</p>
	</div>
</section>
