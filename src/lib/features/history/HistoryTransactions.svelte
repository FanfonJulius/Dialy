<script lang="ts">
	import type { HistoryEntry } from '#lib/domain/history.js';
	import { formatAmount, formatDateTime } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Icon from '#lib/ui/Icon.svelte';
	import NetworkBadge from '#lib/ui/NetworkBadge.svelte';

	type Props = {
		entries: readonly HistoryEntry[];
		networkName: (id: string) => string;
		/** Whether the point is on this phone, so it can open on the map. */
		canOpen: (pointId: string) => boolean;
		onopen: (pointId: string) => void;
	};

	let { entries, networkName, canOpen, onopen }: Props = $props();

	const locale = getLocale();
</script>

{#snippet details(entry: HistoryEntry)}
	<span class="flex min-w-0 flex-1 flex-col gap-1">
		<span class="flex flex-wrap items-center gap-2">
			<NetworkBadge network={entry.network} name={networkName(entry.network)} />
			{#if entry.kind === 'donation'}
				<span class="flex items-center gap-1 text-sm font-semibold text-fg">
					<Icon name="heart" class="size-4 text-primary-ink" />
					{m.history_donation()}
				</span>
			{:else}
				<span class="font-mono text-lg font-semibold text-fg">{entry.code}</span>
			{/if}
		</span>
		<span class="text-sm text-fg-muted">{formatDateTime(entry.dialedAt, locale)}</span>
	</span>
	<span class="shrink-0 font-semibold text-fg">{formatAmount(entry.amount, locale)}</span>
{/snippet}

<ul class="flex flex-col gap-2">
	{#each entries as entry (entry.id)}
		<li>
			{#if entry.pointId && canOpen(entry.pointId)}
				{@const pointId = entry.pointId}
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left active:bg-surface-2"
					onclick={() => onopen(pointId)}
				>
					{@render details(entry)}
				</button>
			{:else}
				<div class="flex items-center gap-3 rounded-2xl bg-surface p-3">{@render details(entry)}</div>
			{/if}
		</li>
	{/each}
</ul>
