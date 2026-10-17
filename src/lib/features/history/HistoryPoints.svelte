<script lang="ts">
	import type { HistoryPoint } from '#lib/domain/history.js';
	import { formatAmount, formatRelativeTime } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import NetworkBadge from '#lib/ui/NetworkBadge.svelte';

	type Props = {
		points: readonly HistoryPoint[];
		networkName: (id: string) => string;
		/** Whether the point is on this phone, so it can open on the map. */
		canOpen: (pointId: string) => boolean;
		onopen: (pointId: string) => void;
	};

	let { points, networkName, canOpen, onopen }: Props = $props();

	const locale = getLocale();
</script>

{#snippet details(point: HistoryPoint)}
	<span class="flex items-center gap-2">
		<NetworkBadge network={point.network} name={networkName(point.network)} />
		<span class="font-mono text-lg font-semibold text-fg">{point.code}</span>
	</span>
	<span class="text-sm text-fg-muted">
		{m.history_point_summary({ count: String(point.withdrawals), total: formatAmount(point.total, locale) })}
	</span>
	<span class="text-sm text-fg-muted">{m.point_last_used({ time: formatRelativeTime(point.lastAt, locale) })}</span>
{/snippet}

<ul class="flex flex-col gap-2">
	{#each points as point (point.key)}
		<li>
			{#if point.pointId && canOpen(point.pointId)}
				{@const pointId = point.pointId}
				<button
					type="button"
					class="flex w-full flex-col items-start gap-1 rounded-2xl bg-surface p-3 text-left active:bg-surface-2"
					onclick={() => onopen(pointId)}
				>
					{@render details(point)}
				</button>
			{:else}
				<div class="flex flex-col gap-1 rounded-2xl bg-surface p-3">{@render details(point)}</div>
			{/if}
		</li>
	{/each}
</ul>
