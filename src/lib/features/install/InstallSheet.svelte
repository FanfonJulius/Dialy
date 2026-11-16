<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { install } from '#lib/stores/install.svelte.js';
	import Icon, { type IconName } from '#lib/ui/Icon.svelte';

	type Step = { text: string; icon: IconName | null };

	const steps = $derived.by((): Step[] => {
		if (install.platform === 'ios') {
			return [
				{ text: m.install_ios_step1(), icon: 'share' },
				{ text: m.install_ios_step2(), icon: 'add-square' },
				{ text: m.install_ios_step3(), icon: null }
			];
		}
		if (install.platform === 'in-app') {
			return [
				{ text: m.install_inapp_step1(), icon: 'dots-horizontal' },
				{ text: m.install_inapp_step2(), icon: null },
				{ text: m.install_inapp_step3(), icon: null }
			];
		}
		return [
			{ text: m.install_android_step1(), icon: 'dots-vertical' },
			{ text: m.install_android_step2(), icon: 'add-square' },
			{ text: m.install_android_step3(), icon: null }
		];
	});

	/** Opens as a modal: focus moves in, the page behind is inert, Esc closes it. */
	function showModal(dialog: HTMLDialogElement): void {
		dialog.showModal();
	}
</script>

{#if install.open}
	<!-- Closing by any means (Esc, Got it, Not now) counts as "not now": the offer rests for a few days. -->
	<dialog
		{@attach showModal}
		class="mx-auto mt-auto mb-0 w-full max-w-md rounded-t-3xl bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-fg shadow-[0_-12px_32px_rgb(0_0_0/0.18)] backdrop:bg-[rgb(0_0_0/0.45)]"
		aria-labelledby="install-title"
		aria-describedby="install-body"
		onclose={() => install.dismiss()}
	>
		<div class="flex items-start gap-4">
			<svg class="size-14 shrink-0 rounded-2xl shadow-md" viewBox="0 0 512 512" aria-hidden="true">
				<rect width="512" height="512" rx="112" fill="#ffb020" />
				<path d="M160.74 256A110 110 0 1 1 351.26 256L256 421Z" fill="#1a1a1a" />
				<circle cx="256" cy="201" r="46" fill="#ffb020" />
			</svg>
			<div class="min-w-0 flex-1">
				<h2 id="install-title" class="text-lg leading-snug font-bold">{m.install_title()}</h2>
				<p id="install-body" class="mt-1 text-sm text-fg-muted">
					{install.platform === 'in-app' ? m.install_inapp_body() : m.install_body()}
				</p>
			</div>
			<button
				type="button"
				class="-mt-1 -mr-1 rounded-full bg-surface-2 p-2 text-fg"
				aria-label={m.install_close()}
				onclick={() => install.dismiss()}
			>
				<Icon name="close" class="size-5" />
			</button>
		</div>
	
		{#if install.canPrompt}
			<div class="mt-5 flex flex-col gap-2">
				<button
					type="button"
					class="flex items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-semibold text-on-primary transition-transform active:scale-[0.98]"
					onclick={() => void install.install()}
				>
					<Icon name="download" class="size-5" />
					{m.install_action()}
				</button>
				<button type="button" class="rounded-full bg-surface-2 py-3 font-semibold" onclick={() => install.dismiss()}>
					{m.install_later()}
				</button>
			</div>
		{:else}
			<ol class="mt-5 flex flex-col gap-3">
				{#each steps as step, index (index)}
					<li class="flex items-center gap-3">
						<span
							class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary"
							aria-hidden="true">{index + 1}</span
						>
						<span class="flex-1 text-sm leading-snug">{step.text}</span>
						{#if step.icon}
							<span class="shrink-0 rounded-lg border border-border bg-surface-2 p-1.5 text-fg">
								<Icon name={step.icon} class="size-5" />
							</span>
						{/if}
					</li>
				{/each}
			</ol>
			<button
				type="button"
				class="mt-5 w-full rounded-full bg-primary py-3.5 font-semibold text-on-primary transition-transform active:scale-[0.98]"
				onclick={() => install.dismiss()}
			>
				{m.install_done()}
			</button>
		{/if}
	</dialog>
{/if}
