<script lang="ts">
	import type { StoredNetwork } from '#lib/data/local/db.js';
	import type { CashPoint } from '#lib/domain/points.js';
	import WithdrawForm from '#lib/features/withdraw/WithdrawForm.svelte';
	import { formatDistance, formatRelativeTime } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { saved } from '#lib/stores/saved.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';
	import NetworkBadge from '#lib/ui/NetworkBadge.svelte';

	type Props = {
		point: CashPoint;
		network: StoredNetwork | undefined;
		networkName: string;
		distanceM: number | null;
		onclose: () => void;
	};

	let { point, network, networkName, distanceM, onclose }: Props = $props();

	const locale = getLocale();
	const isSaved = $derived(saved.ids.has(point.id));
</script>

<section
	class="max-h-[80dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-surface px-5 pt-4 pb-5 shadow-[0_-8px_24px_rgb(0_0_0/0.12)]"
	aria-labelledby="point-code"
>
	<div class="flex items-start justify-between gap-3">
		<div class="flex flex-col gap-1.5">
			<NetworkBadge network={point.network} name={networkName} />
			<p class="text-sm text-fg-muted">{m.point_code()}</p>
			<p id="point-code" class="font-mono text-3xl font-bold tracking-wider text-fg">{point.code}</p>
		</div>
		<div class="flex gap-2">
			<button
				type="button"
				class="rounded-full bg-surface-2 p-2 {isSaved ? 'text-primary-ink' : 'text-fg'}"
				aria-label={m.point_save()}
				aria-pressed={isSaved}
				onclick={() => saved.set(point.id, !isSaved)}
			>
				<Icon name={isSaved ? 'bookmark-filled' : 'bookmark'} class="size-5" />
			</button>
			<button
				type="button"
				class="rounded-full bg-surface-2 p-2 text-fg"
				aria-label={m.point_close()}
				onclick={onclose}
			>
				<Icon name="close" class="size-5" />
			</button>
		</div>
	</div>

	<ul class="mt-3 mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
		{#if distanceM !== null}
			<li>{m.point_distance({ distance: formatDistance(distanceM, locale) })}</li>
		{/if}
		<li>{m.point_withdrawals({ count: String(point.withdrawalCount) })}</li>
		{#if point.lastWithdrawalAt}
			<li>{m.point_last_used({ time: formatRelativeTime(point.lastWithdrawalAt, locale) })}</li>
		{/if}
	</ul>

	{#if network}
		<!-- Keyed by point so an amount typed for one agent never carries over to another. -->
		{#key point.id}
			<WithdrawForm {network} code={point.code} pointId={point.id} />
		{/key}
	{:else}
		<p class="rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg">{m.withdraw_no_template()}</p>
	{/if}
</section>
