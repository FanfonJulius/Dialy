<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import { outbox } from '#lib/stores/outbox.svelte.js';
	import { session, type DeleteAccountResult } from '#lib/stores/session.svelte.js';

	let dialog: HTMLDialogElement;
	let busy = $state(false);
	let deleteError = $state<DeleteAccountResult>(null);
	let unsent = $state(0);

	async function signOut(force = false): Promise<void> {
		busy = true;
		unsent = force ? 0 : await outbox.unsentAfterFlush();
		if (unsent === 0) await session.signOut();
		busy = false;
	}

	async function confirmDelete(): Promise<void> {
		busy = true;
		deleteError = await session.deleteAccount();
		busy = false;
		if (!deleteError) dialog.close();
	}
</script>

<section class="flex flex-col gap-4 rounded-2xl bg-surface p-4" aria-labelledby="account-title">
	<h2 id="account-title" class="text-base font-semibold text-fg">{m.profile_account()}</h2>
	{#if session.user?.email}
		<p class="text-sm break-all text-fg-muted">{m.profile_signed_in_as({ email: session.user.email })}</p>
	{/if}
	<button
		type="button"
		class="rounded-full bg-surface-2 py-3 font-semibold text-fg disabled:opacity-60"
		disabled={busy}
		onclick={() => signOut()}
	>
		{m.profile_sign_out()}
	</button>
	{#if unsent > 0}
		<div class="flex flex-col gap-2 rounded-xl bg-surface-2 p-3" role="alert">
			<p class="text-sm text-fg">{m.profile_sign_out_pending({ count: String(unsent) })}</p>
			<button type="button" class="self-start text-sm font-semibold text-danger" onclick={() => signOut(true)}>
				{m.profile_sign_out_anyway()}
			</button>
		</div>
	{/if}
	<a href={resolve('/privacy')} class="text-sm font-medium text-primary-ink underline">{m.profile_privacy()}</a>
	<button
		type="button"
		class="self-start text-sm font-semibold text-danger"
		onclick={() => {
			deleteError = null;
			dialog.showModal();
		}}
	>
		{m.profile_delete()}
	</button>
</section>

<dialog
	bind:this={dialog}
	class="m-auto w-[min(24rem,calc(100%-2rem))] rounded-2xl bg-surface p-5 text-fg backdrop:bg-[rgb(0_0_0/0.5)]"
	aria-labelledby="delete-title"
>
	<h2 id="delete-title" class="text-lg font-bold">{m.profile_delete_title()}</h2>
	<p class="mt-2 text-sm text-fg-muted">{m.profile_delete_body()}</p>
	{#if deleteError}
		<p class="mt-3 text-sm text-danger" role="alert">
			{deleteError === 'offline' ? m.profile_delete_offline() : m.profile_delete_failed()}
		</p>
	{/if}
	<div class="mt-5 flex flex-col gap-2">
		<button
			type="button"
			class="rounded-full bg-danger py-3 font-semibold text-bg disabled:opacity-60"
			disabled={busy}
			onclick={confirmDelete}
		>
			{m.profile_delete_confirm()}
		</button>
		<button type="button" class="rounded-full bg-surface-2 py-3 font-semibold" onclick={() => dialog.close()}>
			{m.profile_delete_cancel()}
		</button>
	</div>
</dialog>
