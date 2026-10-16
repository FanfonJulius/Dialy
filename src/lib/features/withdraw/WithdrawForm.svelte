<script lang="ts">
	import type { StoredNetwork } from '#lib/data/local/db.js';
	import { fillUssdTemplate, ussdSegments, ussdTelHref } from '#lib/domain/ussd.js';
	import {
		amountIssue,
		codeIssue,
		parseAmount,
		withdrawalLocation,
		type AmountIssue,
		type CodeIssue
	} from '#lib/domain/withdrawal.js';
	import { formatAmount } from '#lib/i18n/format.js';
	import { geolocation } from '#lib/location/geolocation.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { outbox } from '#lib/stores/outbox.svelte.js';
	import AmountField from '#lib/ui/AmountField.svelte';
	import Icon from '#lib/ui/Icon.svelte';

	type Props = {
		network: StoredNetwork;
		code: string;
		/** Lets the user type the agent code (new withdrawal) instead of using the point's. */
		editableCode?: boolean;
		/** The existing point being used, if any: then the server never creates another one. */
		pointId: string | null;
	};

	let { network, code = $bindable(), editableCode = false, pointId }: Props = $props();

	const MAX_CODE_DIGITS = 6;
	const locale = getLocale();
	const id = $props.id();

	let amountText = $state('');
	let attempted = $state(false);
	let copied = $state(false);

	const amount = $derived(parseAmount(amountText));
	const codeProblem = $derived(codeIssue(code, network.codePattern));
	const amountProblem = $derived(amountIssue(amount, network));
	const ussd = $derived(
		network.withdrawalTemplate && !codeProblem && !amountProblem && amount !== null
			? fillUssdTemplate(network.withdrawalTemplate, code, amount)
			: null
	);
	// One id per USSD string: dialing or copying the same withdrawal twice records it once.
	const clientUuid = $derived(ussd ? crypto.randomUUID() : null);
	const canAddPoint = $derived(pointId !== null || geolocation.fix !== null);
	const segments = $derived(network.withdrawalTemplate ? ussdSegments(network.withdrawalTemplate) : []);
	// What is dialed before the agent code, e.g. `*126*16*` (MTN) or `#150*14*` (Orange).
	const codePrefix = $derived(segments[0]?.kind === 'text' && segments[1]?.kind === 'code' ? segments[0].value : '');
	const BLANK = '····';
	// The dial line as it fills in, e.g. `*126*16*` + typed code + `*` + typed amount + `#`.
	const previewParts = $derived(
		segments.map((segment) => {
			if (segment.kind === 'text') return { text: segment.value, blank: false };
			const typed = segment.kind === 'code' ? code : amountText;
			return typed ? { text: typed, blank: false } : { text: BLANK, blank: true };
		})
	);

	$effect(() => {
		void ussd;
		copied = false;
	});

	const codeMessages: Record<CodeIssue, () => string> = {
		code_required: m.withdraw_error_code_required,
		code_invalid: m.withdraw_error_code_invalid
	};

	function amountMessage(issue: AmountIssue): string {
		if (issue === 'amount_too_low') return m.withdraw_error_amount_too_low({ min: formatAmount(network.minAmount, locale) });
		return issue === 'amount_required' ? m.withdraw_error_amount_required() : m.withdraw_error_amount_too_high();
	}

	function record(): void {
		if (!clientUuid || amount === null) return;
		const now = Date.now();
		const location = withdrawalLocation(geolocation.fix, now);
		// Without a point or a position the server could not place the withdrawal.
		if (!pointId && !location) return;
		void outbox.recordWithdrawal({
			clientUuid,
			network: network.id,
			code,
			amount,
			capturedAt: new Date(now).toISOString(),
			pointId,
			location
		});
	}

	function dial(): void {
		attempted = true;
		if (!ussd) return;
		record();
		// Same click as the user's tap, so the browser lets the dialer open.
		window.location.href = ussdTelHref(ussd);
	}

	async function copy(): Promise<void> {
		attempted = true;
		if (!ussd) return;
		try {
			await navigator.clipboard.writeText(ussd);
			copied = true;
			record();
		} catch {
			copied = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	{#if editableCode}
		<div class="flex flex-col gap-2">
			<label for="{id}-code" class="text-sm font-medium text-fg">{m.withdraw_code()}</label>
			<div
				class="flex items-center rounded-xl border bg-surface font-mono text-xl tracking-wider focus-within:border-primary {attempted &&
				codeProblem
					? 'border-danger'
					: 'border-border'}"
			>
				{#if codePrefix}
					<span class="pl-4 text-fg-muted" aria-hidden="true">{codePrefix}</span>
				{/if}
				<input
					id="{id}-code"
					class="min-w-0 flex-1 bg-transparent py-3 pr-4 text-fg outline-none {codePrefix ? 'pl-0.5' : 'pl-4'}"
					type="text"
					inputmode="numeric"
					autocomplete="off"
					maxlength={MAX_CODE_DIGITS}
					aria-invalid={attempted && codeProblem ? true : undefined}
					aria-describedby={attempted && codeProblem ? `${id}-code-error` : undefined}
					value={code}
					oninput={(event) => {
						code = event.currentTarget.value.replace(/\D/g, '').slice(0, MAX_CODE_DIGITS);
						event.currentTarget.value = code;
					}}
				/>
			</div>
			{#if attempted && codeProblem}
				<p id="{id}-code-error" class="text-sm text-danger">{codeMessages[codeProblem]()}</p>
			{/if}
		</div>
	{/if}

	<AmountField
		bind:value={amountText}
		quickAmounts={network.quickAmounts}
		error={attempted && amountProblem ? amountMessage(amountProblem) : null}
	/>

	{#if !network.withdrawalTemplate}
		<p class="rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg" role="alert">{m.withdraw_no_template()}</p>
	{:else}
		<div class="flex flex-col gap-1 rounded-xl bg-surface-2 px-4 py-3">
			<span class="text-sm text-fg-muted">{m.withdraw_ussd()}</span>
			<span class="font-mono text-lg font-semibold break-all text-fg" aria-live="polite"
				>{#each previewParts as part, index (index)}<span class={part.blank ? 'text-fg-muted' : ''}>{part.text}</span
					>{/each}</span
			>
		</div>

		{#if !canAddPoint}
			<p class="text-sm text-fg-muted">{m.withdraw_no_location()}</p>
		{/if}

		<div class="flex gap-2">
			<button
				type="button"
				class="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3.5 text-base font-semibold text-on-primary"
				onclick={dial}
			>
				<Icon name="phone" class="size-5" />
				{m.withdraw_dial()}
			</button>
			<button
				type="button"
				class="rounded-full bg-surface-2 px-4 text-fg"
				aria-label={m.withdraw_copy()}
				onclick={copy}
			>
				<Icon name="copy" class="size-5" />
			</button>
		</div>

		<p class="text-xs text-fg-muted" role="status">{copied ? m.withdraw_copied() : m.withdraw_pin_hint()}</p>
	{/if}
</div>
