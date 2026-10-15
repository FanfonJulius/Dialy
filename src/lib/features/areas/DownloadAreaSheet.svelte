<script lang="ts">
	import { onMount } from 'svelte';
	import type { OfflineArea } from '#lib/data/local/db.js';
	import type { Bounds } from '#lib/domain/geo.js';
	import { formatBytes } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { areas, type AreaEstimate } from '#lib/stores/areas.svelte.js';
	import { connectivity } from '#lib/stores/connectivity.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';

	let { bounds, onclose }: { bounds: Bounds; onclose: () => void } = $props();

	const MAX_NAME_LENGTH = 40;
	const locale = getLocale();
	const id = $props.id();
	const defaultName = m.areas_default_name({ number: String(areas.areas.length + 1) });

	let name = $state('');
	let estimate = $state<AreaEstimate | null>(null);
	let running = $state(false);
	let finished = $state<OfflineArea | null>(null);

	const progress = $derived(running ? areas.active?.progress : undefined);
	const percent = $derived(progress && progress.total > 0 ? Math.floor((progress.done / progress.total) * 100) : 0);
	const blocked = $derived(
		!connectivity.online ? m.areas_offline() : areas.active && !running ? m.areas_busy() : null
	);

	onMount(async () => {
		estimate = await areas.estimate(bounds);
	});

	async function start(): Promise<void> {
		running = true;
		finished = (await areas.download(name.trim() || defaultName, bounds)) ?? null;
		running = false;
	}
</script>

<section
	class="rounded-t-3xl border-t border-border bg-surface px-5 pt-4 pb-5 shadow-[0_-8px_24px_rgb(0_0_0/0.12)]"
	aria-labelledby="{id}-title"
>
	<div class="mb-2 flex items-center justify-between gap-3">
		<h2 id="{id}-title" class="text-lg font-semibold text-fg">{m.areas_sheet_title()}</h2>
		<button
			type="button"
			class="rounded-full bg-surface-2 p-2 text-fg"
			aria-label={running ? m.areas_cancel() : m.areas_close()}
			onclick={() => (running ? areas.cancel() : onclose())}
		>
			<Icon name="close" class="size-5" />
		</button>
	</div>
	<p class="mb-4 text-sm text-fg-muted">{m.areas_sheet_body()}</p>

	{#if finished}
		<p class="mb-4 text-sm font-medium {finished.status === 'ready' ? 'text-success' : 'text-danger'}" role="status">
			{finished.status === 'ready' ? m.areas_done() : m.areas_incomplete()}
		</p>
		<button type="button" class="w-full rounded-full bg-surface-2 py-3 font-semibold text-fg" onclick={onclose}>
			{m.areas_close()}
		</button>
	{:else if running}
		<div class="flex flex-col gap-2" role="status">
			<div class="h-2 overflow-hidden rounded-full bg-surface-2">
				<div class="h-full rounded-full bg-primary transition-[width]" style:width="{percent}%"></div>
			</div>
			<p class="text-sm text-fg">{m.areas_progress({ percent: String(percent) })}</p>
		</div>
		<button type="button" class="mt-4 w-full rounded-full bg-surface-2 py-3 font-semibold text-fg" onclick={() => areas.cancel()}>
			{m.areas_cancel()}
		</button>
	{:else if estimate?.tooLarge}
		<p class="text-sm text-fg" role="alert">{m.areas_too_large()}</p>
	{:else}
		<label class="mb-1 block text-sm font-medium text-fg" for="{id}-name">{m.areas_name()}</label>
		<input
			id="{id}-name"
			class="mb-3 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-fg outline-none focus:border-primary"
			type="text"
			maxlength={MAX_NAME_LENGTH}
			placeholder={defaultName}
			bind:value={name}
		/>
		{#if estimate}
			<p class="mb-4 text-sm text-fg-muted">
				{estimate.tiles === 0 ? m.areas_points_only() : m.areas_estimate({ size: formatBytes(estimate.bytes, locale) })}
			</p>
		{/if}
		{#if blocked}
			<p class="mb-3 text-sm text-fg" role="alert">{blocked}</p>
		{/if}
		<button
			type="button"
			class="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-semibold text-on-primary disabled:opacity-60"
			disabled={!estimate || blocked !== null}
			onclick={start}
		>
			<Icon name="download" class="size-5" />
			{m.areas_start()}
		</button>
	{/if}
</section>
