<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { historyPoints } from '#lib/domain/history.js';
	import HistoryPoints from '#lib/features/history/HistoryPoints.svelte';
	import HistoryTransactions from '#lib/features/history/HistoryTransactions.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { history } from '#lib/stores/history.svelte.js';
	import { localData } from '#lib/stores/local-data.svelte.js';
	import { mapFocus } from '#lib/stores/map-focus.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';

	type View = 'transactions' | 'points';

	let view = $state<View>('transactions');

	const tabs: readonly { id: View; label: () => string }[] = [
		{ id: 'transactions', label: m.history_transactions },
		{ id: 'points', label: m.history_points }
	];
	const points = $derived(historyPoints(history.entries));
	const pointIds = $derived(new Set(localData.points.map((point) => point.id)));

	onMount(() => void history.pull());

	function networkName(id: string): string {
		return localData.networkName(id);
	}

	function open(pointId: string): void {
		mapFocus.open(pointId);
		void goto(resolve('/(app)'));
	}
</script>

<section class="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
	<div class="flex items-center gap-2">
		<a href={resolve('/(app)')} class="-ml-2 rounded-full p-2 text-fg" aria-label={m.history_back()}>
			<Icon name="chevron-left" />
		</a>
		<h1 class="text-2xl font-bold text-fg">{m.history_title()}</h1>
	</div>

	{#if history.entries.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
			<span class="rounded-full bg-surface-2 p-4 text-fg-muted">
				<Icon name="history" class="size-8" />
			</span>
			<h2 class="text-lg font-semibold text-fg">{m.history_empty_title()}</h2>
			<p class="max-w-xs text-fg-muted">{m.history_empty_body()}</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1" role="tablist" aria-label={m.history_title()}>
			{#each tabs as tab (tab.id)}
				{@const selected = view === tab.id}
				<button
					type="button"
					role="tab"
					id="history-tab-{tab.id}"
					aria-selected={selected}
					aria-controls="history-panel"
					class="min-h-11 rounded-lg text-sm font-medium {selected ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted'}"
					onclick={() => (view = tab.id)}
				>
					{tab.label()}
				</button>
			{/each}
		</div>

		<div id="history-panel" role="tabpanel" aria-labelledby="history-tab-{view}">
			{#if view === 'transactions'}
				<HistoryTransactions
					entries={history.entries}
					{networkName}
					canOpen={(id) => pointIds.has(id)}
					onopen={open}
				/>
			{:else}
				<HistoryPoints {points} {networkName} canOpen={(id) => pointIds.has(id)} onopen={open} />
			{/if}
		</div>
	{/if}
</section>
