<script lang="ts">
	import type { StoredNetwork } from '#lib/data/local/db.js';
	import type { Fix } from '#lib/domain/location.js';
	import { nearestPoints, type CashPoint } from '#lib/domain/points.js';
	import { formatDistance } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import Icon from '#lib/ui/Icon.svelte';
	import WithdrawForm from './WithdrawForm.svelte';

	type Props = {
		networks: readonly StoredNetwork[];
		points: readonly CashPoint[];
		fix: Fix | null;
		onselectpoint: (point: CashPoint) => void;
		onclose: () => void;
	};

	let { networks, points, fix, onselectpoint, onclose }: Props = $props();

	// Within this distance the same code is the same agent (matches record_withdrawal's 300 m).
	const SAME_AGENT_RADIUS_M = 300;
	const SUGGEST_RADIUS_M = 150;
	const MAX_SUGGESTIONS = 3;
	const locale = getLocale();

	let chosenNetwork = $state<string | null>(null);
	let code = $state('');

	const networkId = $derived(chosenNetwork ?? networks[0]?.id ?? '');
	const network = $derived(networks.find((candidate) => candidate.id === networkId));
	const sameNetwork = $derived(points.filter((point) => point.network === networkId));
	const suggestions = $derived(
		fix
			? nearestPoints(sameNetwork, fix, MAX_SUGGESTIONS).filter(({ distanceM }) => distanceM <= SUGGEST_RADIUS_M)
			: []
	);
	// Typing the code of an agent already on the map nearby reuses that point instead of adding one.
	const known = $derived(
		fix && code
			? nearestPoints(
					sameNetwork.filter((point) => point.code === code),
					fix,
					1
				).find(({ distanceM }) => distanceM <= SAME_AGENT_RADIUS_M)
			: undefined
	);
</script>

<section
	class="max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface px-5 pt-4 pb-5 shadow-[0_-8px_24px_rgb(0_0_0/0.12)]"
	aria-labelledby="new-withdrawal-title"
>
	<div class="mb-4 flex items-center justify-between gap-3">
		<h2 id="new-withdrawal-title" class="text-lg font-semibold text-fg">{m.withdraw_new_title()}</h2>
		<button type="button" class="rounded-full bg-surface-2 p-2 text-fg" aria-label={m.withdraw_cancel()} onclick={onclose}>
			<Icon name="close" class="size-5" />
		</button>
	</div>

	<div class="mb-4 flex gap-2" role="radiogroup" aria-label={m.withdraw_network()}>
		{#each networks as candidate (candidate.id)}
			{@const checked = candidate.id === networkId}
			<button
				type="button"
				role="radio"
				aria-checked={checked}
				class="flex-1 rounded-full border py-2.5 text-sm font-semibold {checked
					? 'border-primary bg-primary text-on-primary'
					: 'border-border bg-surface-2 text-fg'}"
				onclick={() => (chosenNetwork = candidate.id)}
			>
				{candidate.name}
			</button>
		{/each}
	</div>

	{#if suggestions.length > 0}
		<div class="mb-4 flex flex-col gap-2">
			<h3 class="text-sm font-medium text-fg-muted">{m.withdraw_nearby_agents()}</h3>
			<ul class="flex flex-wrap gap-2">
				{#each suggestions as { point, distanceM } (point.id)}
					<li>
						<button
							type="button"
							class="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm text-fg"
							onclick={() => onselectpoint(point)}
						>
							<span class="font-mono font-semibold">{point.code}</span>
							<span class="text-fg-muted">· {formatDistance(distanceM, locale)}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if network}
		<WithdrawForm {network} bind:code editableCode pointId={known?.point.id ?? null} />
		{#if known}
			<p class="mt-2 text-sm text-fg-muted">
				{m.withdraw_known_point({ distance: formatDistance(known.distanceM, locale) })}
			</p>
		{/if}
	{/if}
</section>
