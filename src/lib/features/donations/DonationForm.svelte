<script lang="ts">
	import {
		DONATION_LIMITS,
		DONATION_NETWORKS,
		DONATION_QUICK_AMOUNTS,
		DONATION_TARGETS,
		donationUssd,
		type DonationNetwork
	} from '#lib/domain/donation.js';
	import { ussdSegments, ussdTelHref } from '#lib/domain/ussd.js';
	import { amountIssue, parseAmount, type AmountIssue } from '#lib/domain/withdrawal.js';
	import { formatAmount, formatPhoneNumber } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import AmountField from '#lib/ui/AmountField.svelte';
	import Icon from '#lib/ui/Icon.svelte';

	const BLANK = '····';
	const locale = getLocale();
	const id = $props.id();

	let network = $state<DonationNetwork>('mtn');
	let amountText = $state('');
	let attempted = $state(false);
	let copied = $state(false);

	const target = $derived(DONATION_TARGETS[network]);
	const amount = $derived(parseAmount(amountText));
	const amountProblem = $derived(amountIssue(amount, DONATION_LIMITS));
	const ussd = $derived(amount !== null && !amountProblem ? donationUssd(target, amount) : null);
	// The dial line as it fills in, e.g. `*126*9*654571914*` + typed amount + `#`.
	const previewParts = $derived(
		ussdSegments(target.template).map((segment) => {
			if (segment.kind === 'text') return { text: segment.value, blank: false };
			if (segment.kind === 'code') return { text: target.number, blank: false };
			return amountText ? { text: amountText, blank: false } : { text: BLANK, blank: true };
		})
	);

	$effect(() => {
		void ussd;
		copied = false;
	});

	function amountMessage(issue: AmountIssue): string {
		if (issue === 'amount_too_low') {
			return m.withdraw_error_amount_too_low({ min: formatAmount(DONATION_LIMITS.minAmount, locale) });
		}
		return issue === 'amount_required' ? m.withdraw_error_amount_required() : m.withdraw_error_amount_too_high();
	}

	function dial(): void {
		attempted = true;
		if (!ussd) return;
		// Same click as the user's tap, so the browser lets the dialer open.
		window.location.href = ussdTelHref(ussd);
	}

	async function copy(): Promise<void> {
		attempted = true;
		if (!ussd) return;
		try {
			await navigator.clipboard.writeText(ussd);
			copied = true;
		} catch {
			copied = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-2">
		<span id="{id}-network" class="text-sm font-medium text-fg">{m.donations_network()}</span>
		<div class="flex gap-2" role="radiogroup" aria-labelledby="{id}-network">
			{#each DONATION_NETWORKS as option (option)}
				{@const checked = option === network}
				<button
					type="button"
					role="radio"
					aria-checked={checked}
					class="flex-1 rounded-full border py-2.5 text-sm font-semibold {checked
						? 'border-primary bg-primary text-on-primary'
						: 'border-border bg-surface-2 text-fg'}"
					onclick={() => (network = option)}
				>
					{DONATION_TARGETS[option].name}
				</button>
			{/each}
		</div>
	</div>

	<div class="flex flex-col gap-1 rounded-xl bg-surface-2 px-4 py-3">
		<span class="text-sm text-fg-muted">{m.donations_recipient({ network: target.name })}</span>
		<span class="font-mono text-xl font-semibold text-fg">{formatPhoneNumber(target.number)}</span>
	</div>

	<AmountField
		bind:value={amountText}
		quickAmounts={DONATION_QUICK_AMOUNTS}
		error={attempted && amountProblem ? amountMessage(amountProblem) : null}
	/>

	<div class="flex flex-col gap-1 rounded-xl bg-surface-2 px-4 py-3">
		<span class="text-sm text-fg-muted">{m.withdraw_ussd()}</span>
		<span class="font-mono text-lg font-semibold break-all text-fg" aria-live="polite"
			>{#each previewParts as part, index (index)}<span class={part.blank ? 'text-fg-muted' : ''}>{part.text}</span
				>{/each}</span
		>
	</div>

	<div class="flex gap-2">
		<button
			type="button"
			class="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-base font-semibold text-on-primary"
			onclick={dial}
		>
			<Icon name="phone" class="size-5" />
			{m.withdraw_dial()}
		</button>
		<button type="button" class="rounded-full bg-surface-2 px-4 text-fg" aria-label={m.withdraw_copy()} onclick={copy}>
			<Icon name="copy" class="size-5" />
		</button>
	</div>

	<p class="text-xs text-fg-muted" role="status">{copied ? m.withdraw_copied() : m.donations_pin_hint()}</p>
</div>
