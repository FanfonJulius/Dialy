<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { distanceMeters } from '#lib/domain/geo.js';
	import type { CashPoint } from '#lib/domain/points.js';
	import { formatDistance, formatRelativeTime } from '#lib/i18n/format.js';
	import { geolocation } from '#lib/location/geolocation.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { localData } from '#lib/stores/local-data.svelte.js';
	import { mapFocus } from '#lib/stores/map-focus.svelte.js';
	import { saved } from '#lib/stores/saved.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';
	import NetworkBadge from '#lib/ui/NetworkBadge.svelte';

	const locale = getLocale();
	const pointsById = $derived(new Map(localData.points.map((point) => [point.id, point])));
	// Points not on the device yet (saved elsewhere, not synced) appear after the next pull.
	const items = $derived(
		saved.entries.flatMap((entry) => {
			const point = pointsById.get(entry.pointId);
			return point ? [point] : [];
		})
	);

	function open(point: CashPoint): void {
		mapFocus.open(point.id);
		void goto(resolve('/(app)'));
	}
</script>

{#if items.length === 0}
	<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
		<span class="rounded-full bg-surface-2 p-4 text-fg-muted">
			<Icon name="bookmark" class="size-8" />
		</span>
		<h2 class="text-lg font-semibold text-fg">{m.saved_empty_title()}</h2>
		<p class="max-w-xs text-fg-muted">{m.saved_empty_body()}</p>
	</div>
{:else}
	<ul class="flex flex-col gap-2">
		{#each items as point (point.id)}
			<li class="flex items-center gap-2 rounded-2xl bg-surface p-2">
				<button type="button" class="flex min-w-0 flex-1 flex-col gap-1 rounded-xl p-2 text-left" onclick={() => open(point)}>
					<span class="flex items-center gap-2">
						<NetworkBadge network={point.network} name={localData.networkName(point.network)} />
						<span class="font-mono text-lg font-semibold text-fg">{point.code}</span>
					</span>
					<span class="text-sm text-fg-muted">
						{#if geolocation.fix}
							{m.point_distance({ distance: formatDistance(distanceMeters(geolocation.fix, point), locale) })}
						{/if}
						{#if point.lastWithdrawalAt}
							{#if geolocation.fix}·{/if}
							{m.point_last_used({ time: formatRelativeTime(point.lastWithdrawalAt, locale) })}
						{/if}
					</span>
				</button>
				<button
					type="button"
					class="rounded-full p-3 text-primary-ink"
					aria-label={m.saved_remove()}
					onclick={() => saved.set(point.id, false)}
				>
					<Icon name="bookmark-filled" class="size-5" />
				</button>
			</li>
		{/each}
	</ul>
{/if}
