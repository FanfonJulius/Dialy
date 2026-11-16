<script lang="ts">
	import type { StoredNetwork } from '#lib/data/local/db.js';
	import type { CashPoint } from '#lib/domain/points.js';
	import WithdrawForm from '#lib/features/withdraw/WithdrawForm.svelte';
	import { formatDistance, formatRelativeTime } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { history } from '#lib/stores/history.svelte.js';
	import { outbox } from '#lib/stores/outbox.svelte.js';
	import { saved } from '#lib/stores/saved.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';
	import NetworkBadge from '#lib/ui/NetworkBadge.svelte';

	type Props = {
		point: CashPoint;
		network: StoredNetwork | undefined;
		networkName: string;
		distanceM: number | null;
		/** Shows the walking route; null when the point is close by or already routed to. */
		ondirections: (() => void) | null;
		onclose: () => void;
	};

	let { point, network, networkName, distanceM, ondirections, onclose }: Props = $props();

	const locale = getLocale();
	const isSaved = $derived(saved.ids.has(point.id));
	// Only the author knows (from their own history); other users never learn who added a point.
	const isMine = $derived(history.createdPointIds.has(point.id));
	let deleteDialog = $state<HTMLDialogElement>();

	async function deletePoint(): Promise<void> {
		deleteDialog?.close();
		await outbox.deletePoint(point);
		onclose();
	}
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

	{#if ondirections}
		<button
			type="button"
			class="mb-4 flex items-center gap-2 rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary-ink"
			onclick={ondirections}
		>
			<Icon name="directions" class="size-5" />
			{m.map_directions()}
		</button>
	{/if}

	{#if network}
		<!-- Keyed by point so an amount typed for one agent never carries over to another. -->
		{#key point.id}
			<WithdrawForm {network} code={point.code} pointId={point.id} />
		{/key}
	{:else}
		<p class="rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg">{m.withdraw_no_template()}</p>
	{/if}

	{#if isMine}
		<div class="mt-5 flex items-center justify-between gap-3 border-t border-border pt-3">
			<p class="text-sm text-fg-muted">{m.point_added_by_you()}</p>
			<button
				type="button"
				class="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-danger active:bg-surface-2"
				onclick={() => deleteDialog?.showModal()}
			>
				<Icon name="trash" class="size-4" />
				{m.point_delete()}
			</button>
		</div>
	{/if}
</section>

{#if isMine}
	<dialog
		bind:this={deleteDialog}
		class="m-auto w-[min(24rem,calc(100%-2rem))] rounded-2xl bg-surface p-5 text-fg backdrop:bg-[rgb(0_0_0/0.5)]"
		aria-labelledby="delete-point-title"
	>
		<h2 id="delete-point-title" class="text-lg font-bold">{m.point_delete_title({ code: point.code })}</h2>
		<p class="mt-2 text-sm text-fg-muted">{m.point_delete_body()}</p>
		<div class="mt-5 flex flex-col gap-2">
			<button type="button" class="rounded-full bg-danger py-3 font-semibold text-bg" onclick={deletePoint}>
				{m.point_delete_confirm()}
			</button>
			<button type="button" class="rounded-full bg-surface-2 py-3 font-semibold" onclick={() => deleteDialog?.close()}>
				{m.point_delete_cancel()}
			</button>
		</div>
	</dialog>
{/if}
