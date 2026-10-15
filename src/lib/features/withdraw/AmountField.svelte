<script lang="ts">
	import { formatAmount } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';

	type Props = {
		value: string;
		quickAmounts: readonly number[];
		error: string | null;
	};

	let { value = $bindable(), quickAmounts, error }: Props = $props();

	const MAX_DIGITS = 10;
	const locale = getLocale();
	const id = $props.id();
</script>

<div class="flex flex-col gap-2">
	<label for="{id}-amount" class="text-sm font-medium text-fg">{m.withdraw_amount()}</label>
	<input
		id="{id}-amount"
		class="rounded-xl border bg-surface px-4 py-3 font-mono text-xl text-fg outline-none focus:border-primary {error
			? 'border-danger'
			: 'border-border'}"
		type="text"
		inputmode="numeric"
		autocomplete="off"
		enterkeyhint="go"
		maxlength={MAX_DIGITS}
		aria-invalid={error ? true : undefined}
		aria-describedby={error ? `${id}-amount-error` : undefined}
		{value}
		oninput={(event) => {
			value = event.currentTarget.value.replace(/\D/g, '').slice(0, MAX_DIGITS);
			event.currentTarget.value = value;
		}}
	/>
	{#if error}
		<p id="{id}-amount-error" class="text-sm text-danger">{error}</p>
	{/if}
	{#if quickAmounts.length > 0}
		<div class="flex flex-wrap gap-2" role="group" aria-label={m.withdraw_quick_amounts()}>
			{#each quickAmounts as amount (amount)}
				<button
					type="button"
					class="rounded-full border px-3 py-1.5 text-sm font-medium {value === String(amount)
						? 'border-primary bg-primary text-on-primary'
						: 'border-border bg-surface-2 text-fg'}"
					aria-pressed={value === String(amount)}
					onclick={() => (value = String(amount))}
				>
					{formatAmount(amount, locale)}
				</button>
			{/each}
		</div>
	{/if}
</div>
