<script lang="ts">
	import type { CashPoint, NearbyPoint } from '#lib/domain/points.js';
	import { formatDistance } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Icon from '#lib/ui/Icon.svelte';
	import NetworkBadge from '#lib/ui/NetworkBadge.svelte';

	type Props = {
		items: readonly NearbyPoint[];
		networkName: (id: string) => string;
		onselect: (point: CashPoint) => void;
	};

	let { items, networkName, onselect }: Props = $props();

	const PEEK_COUNT = 1;
	const locale = getLocale();
	let expanded = $state(false);
	const visible = $derived(expanded ? items : items.slice(0, PEEK_COUNT));
</script>

<section
	class="flex max-h-[60dvh] flex-col rounded-t-3xl border-t border-border bg-surface shadow-[0_-8px_24px_rgb(0_0_0/0.12)]"
	aria-labelledby="nearby-title"
>
	<button
		type="button"
		class="flex items-center justify-between px-5 pt-2 pb-2"
		aria-expanded={expanded}
		aria-controls="nearby-list"
		onclick={() => (expanded = !expanded)}
	>
		<span class="flex flex-col items-start">
			<span class="mx-auto mb-2 h-1 w-10 self-center rounded-full bg-border" aria-hidden="true"></span>
			<span id="nearby-title" class="text-base font-semibold text-fg">{m.nearby_title()}</span>
		</span>
		<span class="flex items-center gap-1 text-sm text-fg-muted">
			<span class="sr-only">{expanded ? m.nearby_collapse() : m.nearby_expand()}</span>
			<Icon name="chevron-up" class="size-5 transition-transform {expanded ? 'rotate-180' : ''}" />
		</span>
	</button>

	{#if items.length === 0}
		<p class="px-5 pb-5 text-sm text-fg-muted">{m.nearby_empty()}</p>
	{:else}
		<ul id="nearby-list" class="min-h-0 overflow-y-auto px-3 pb-3">
			{#each visible as { point, distanceM } (point.id)}
				<li>
					<button
						type="button"
						class="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left active:bg-surface-2"
						onclick={() => onselect(point)}
					>
						<NetworkBadge network={point.network} name={networkName(point.network)} />
						<span class="flex-1 font-mono text-lg font-semibold text-fg">{point.code}</span>
						<span class="text-sm text-fg-muted">{formatDistance(distanceM, locale)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
