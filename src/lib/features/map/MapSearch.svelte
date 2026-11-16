<script lang="ts">
	import { resolve } from '$app/paths';
	import type { StoredNetwork } from '#lib/data/local/db.js';
	import type { PointFilter } from '#lib/domain/points.js';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';

	type Props = {
		filter: PointFilter;
		networks: readonly StoredNetwork[];
		/** Called when the user submits a code (Search button or the keyboard's search key). */
		onsearch?: (code: string) => void;
	};

	let { filter = $bindable(), networks, onsearch }: Props = $props();

	const MAX_CODE_LENGTH = 6;
	// What is typed; it only filters the map once the user searches.
	let draftCode = $state(filter.code);
	let input: HTMLInputElement;

	function setCode(raw: string): void {
		draftCode = raw.replace(/\D/g, '').slice(0, MAX_CODE_LENGTH);
	}

	function search(event: SubmitEvent): void {
		event.preventDefault();
		filter = { ...filter, code: draftCode };
		// Closes the phone keyboard so the result on the map is visible.
		input.blur();
		if (draftCode) onsearch?.(draftCode);
	}

	function clear(): void {
		draftCode = '';
		filter = { ...filter, code: '' };
		input.focus();
	}

	const chips = $derived([
		{ id: 'all', label: m.map_filter_all() },
		...networks.map((network) => ({ id: network.id, label: network.name }))
	]);
</script>

<div class="flex flex-col gap-2">
	<form
		role="search"
		class="flex items-center gap-1 rounded-full border border-border bg-surface py-1.5 pr-1.5 pl-4 shadow-md focus-within:border-primary"
		onsubmit={search}
	>
		<label class="flex min-w-0 flex-1 items-center gap-2">
			<Icon name="search" class="size-5 shrink-0 text-fg-muted" />
			<span class="sr-only">{m.map_search_label()}</span>
			<input
				bind:this={input}
				class="min-w-0 flex-1 bg-transparent py-1 text-base text-fg outline-none placeholder:text-fg-muted"
				type="text"
				inputmode="numeric"
				enterkeyhint="search"
				autocomplete="off"
				maxlength={MAX_CODE_LENGTH}
				placeholder={m.map_search_placeholder()}
				value={draftCode}
				oninput={(event) => {
					setCode(event.currentTarget.value);
					event.currentTarget.value = draftCode;
				}}
			/>
		</label>
		{#if draftCode}
			<button type="button" class="rounded-full p-2 text-fg-muted active:bg-surface-2" aria-label={m.map_search_clear()} onclick={clear}>
				<Icon name="close" class="size-5" />
			</button>
		{/if}
		<button
			type="submit"
			class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-transform active:scale-95"
		>
			{m.map_search_submit()}
		</button>
	</form>

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
