<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { serviceWorkerUpdates } from '#lib/pwa/service-worker-updates.svelte.js';
</script>

{#if serviceWorkerUpdates.available}
	<div
		role="status"
		class="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-surface p-3 text-sm text-fg shadow-lg"
	>
		<p class="flex-1">{m.update_available()}</p>
		<button
			type="button"
			class="min-h-11 rounded-lg bg-primary px-4 font-semibold text-on-primary"
			onclick={() => serviceWorkerUpdates.apply()}
		>
			{m.update_apply()}
		</button>
	</div>
{/if}
