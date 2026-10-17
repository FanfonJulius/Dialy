<script lang="ts">
	import { formatDistance, formatDuration } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { directions } from '#lib/stores/directions.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';

	type Props = {
		networkName: (id: string) => string;
		/** Opens the destination's card (e.g. to withdraw once there). */
		onopen: () => void;
	};

	let { networkName, onopen }: Props = $props();

	const locale = getLocale();

	const summary = $derived.by(() => {
		const distance = directions.remainingM === null ? '' : formatDistance(directions.remainingM, locale);
		switch (directions.status) {
			case 'loading':
				return m.directions_loading();
			case 'route':
				return m.directions_summary({ distance, time: formatDuration(directions.remainingS ?? 0, locale) });
			case 'straight':
				return m.directions_straight({ distance });
			default:
				return m.directions_arrived();
		}
	});
</script>

{#if directions.target}
	{@const target = directions.target}
	<div class="pointer-events-auto flex items-center gap-2 rounded-2xl border border-border bg-surface p-2 shadow-md">
		<button type="button" class="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left" onclick={onopen}>
			<span class="shrink-0 rounded-full bg-primary p-2 text-on-primary">
				<Icon name="directions" class="size-5" />
			</span>
			<span class="flex min-w-0 flex-col">
				<span class="truncate text-sm font-semibold text-fg">
					{networkName(target.network)} <span class="font-mono">{target.code}</span>
				</span>
				<span class="text-sm text-fg-muted" role="status">{summary}</span>
			</span>
		</button>
		<button
			type="button"
			class="shrink-0 rounded-full bg-surface-2 p-2 text-fg"
			aria-label={m.directions_stop()}
			onclick={() => directions.stop()}
		>
			<Icon name="close" class="size-5" />
		</button>
	</div>
	{#if directions.status === 'route'}
		<p class="pointer-events-auto self-end rounded-full bg-surface px-3 py-1 text-xs text-fg-muted shadow">
			<a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener" class="underline"
				>{m.directions_credit()}</a
			>
			·
			<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener" class="underline"
				>{m.directions_fix_map()}</a
			>
		</p>
	{/if}
{/if}
