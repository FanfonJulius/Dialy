<script lang="ts">
	import { resolve } from '$app/paths';
	import type { StoredNetwork } from '#lib/data/local/db.js';
	import type { PointFilter } from '#lib/domain/points.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';

	let { filter = $bindable(), networks }: { filter: PointFilter; networks: readonly StoredNetwork[] } =
		$props();

	const MAX_CODE_LENGTH = 6;

	function setCode(raw: string): void {
		filter = { ...filter, code: raw.replace(/\D/g, '').slice(0, MAX_CODE_LENGTH) };
	}

	const chips = $derived([
		{ id: 'all', label: m.map_filter_all() },
		...networks.map((network) => ({ id: network.id, label: network.name }))
	]);
</script>

<div class="flex flex-col gap-2">
	<label class="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 shadow-md">
		<Icon name="search" class="size-5 shrink-0 text-fg-muted" />
		<span class="sr-only">{m.map_search_label()}</span>
		<input
			class="min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-muted"
			type="text"
			inputmode="numeric"
			autocomplete="off"
			maxlength={MAX_CODE_LENGTH}
			placeholder={m.map_search_placeholder()}
			value={filter.code}
			oninput={(event) => {
				setCode(event.currentTarget.value);
				event.currentTarget.value = filter.code;
			}}
		/>
		{#if filter.code}
			<button
				type="button"
				class="-m-1 rounded-full p-1 text-fg-muted"
				aria-label={m.map_search_clear()}
				onclick={() => setCode('')}
			>
				<Icon name="close" class="size-5" />
			</button>
		{/if}
	</label>

	<div class="flex items-center gap-2">
		<!-- On narrow phones the chips scroll sideways instead of breaking onto two lines. -->
		<div
			class="chips -my-1 flex min-w-0 gap-2 overflow-x-auto py-1 [scrollbar-width:none]"
			role="radiogroup"
			aria-label={m.map_filter_label()}
		>
			{#each chips as chip (chip.id)}
				{@const checked = filter.network === chip.id}
				<button
					type="button"
					role="radio"
					aria-checked={checked}
					class="rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap shadow-sm {checked
						? 'border-primary bg-primary text-on-primary'
						: 'border-border bg-surface text-fg'}"
					onclick={() => (filter = { ...filter, network: chip.id })}
				>
					{chip.label}
				</button>
			{/each}
		</div>
		<a
			href={resolve('/(app)/history')}
			class="shrink-0 rounded-full border border-border bg-surface p-1.5 text-fg shadow-sm"
			aria-label={m.history_title()}
		>
			<Icon name="history" class="size-5" />
		</a>
	</div>
</div>

<style>
	/* While more chips are off to the right, the last visible one fades out (no fade when all fit). */
	@property --chips-fade {
		syntax: '<length>';
		inherits: false;
		initial-value: 0px;
	}

	.chips {
		mask-image: linear-gradient(to right, #000 calc(100% - var(--chips-fade)), transparent);
		animation: chips-fade linear both;
		animation-timeline: scroll(self inline);
	}

	@keyframes chips-fade {
		from {
			--chips-fade: 1.5rem;
		}
		to {
			--chips-fade: 0px;
		}
	}
</style>
