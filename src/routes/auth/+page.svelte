<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { credentialsIssue, normalizeEmail, type AuthMode } from '#lib/domain/auth.js';
	import LanguageSwitcher from '#lib/features/profile/LanguageSwitcher.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { session } from '#lib/stores/session.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';

	type ErrorKey =
		| NonNullable<ReturnType<typeof credentialsIssue>>
		| NonNullable<Awaited<ReturnType<typeof session.signUp>>>;

	const ERROR_MESSAGES: Record<ErrorKey, () => string> = {
		email_invalid: m.auth_error_email_invalid,
		password_required: m.auth_error_password_required,
		password_too_short: m.auth_error_weak_password,
		password_too_long: m.auth_error_password_too_long,
		password_needs_letter_and_digit: m.auth_error_weak_password,
		invalid_credentials: m.auth_error_invalid_credentials,
		email_taken: m.auth_error_email_taken,
		weak_password: m.auth_error_weak_password,
		rate_limited: m.auth_error_rate_limited,
		signup_disabled: m.auth_error_signup_disabled,
		offline: m.auth_error_offline,
		confirmation_pending: m.auth_error_confirmation_pending,
		unknown: m.auth_error_unknown
	};

	let mode = $state<AuthMode>('sign-in');
	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let busy = $state(false);
	let error = $state<ErrorKey | null>(null);

	function switchMode(next: AuthMode): void {
		mode = next;
		error = null;
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy) return;
		const normalized = normalizeEmail(email);
		error = credentialsIssue(normalized, password, mode);
		if (error) return;
		busy = true;
		try {
			error =
				mode === 'sign-in'
					? await session.signIn(normalized, password)
					: await session.signUp(normalized, password);
		} finally {
			busy = false;
		}
		if (!error) await goto(resolve('/(app)'), { replace: true });
	}
</script>

<main class="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
	<header class="flex flex-col items-center gap-2 pt-6 text-center">
		<img src="/favicon.svg" alt="" class="size-16" />
		<h1 class="text-3xl font-bold text-fg">{m.app_name()}</h1>
		<p class="text-fg-muted">{m.app_tagline()}</p>
	</header>

	<div class="grid grid-cols-2 rounded-full bg-surface-2 p-1" role="tablist" aria-label={m.auth_mode_label()}>
		{#each [['sign-in', m.auth_sign_in_tab], ['sign-up', m.auth_sign_up_tab]] as const as [value, label] (value)}
			<button
				type="button"
				role="tab"
				aria-selected={mode === value}
				class="rounded-full py-2 text-sm font-semibold {mode === value
					? 'bg-surface text-fg shadow-sm'
					: 'text-fg-muted'}"
				onclick={() => switchMode(value)}
			>
				{label()}
			</button>
		{/each}
	</div>

	<form class="flex flex-col gap-4" novalidate onsubmit={submit}>
		<label class="flex flex-col gap-1.5">
			<span class="text-sm font-medium text-fg">{m.auth_email()}</span>
			<input
				class="rounded-xl border border-border bg-surface px-4 py-3 text-base text-fg outline-none focus:border-primary"
				type="email"
				autocomplete="email"
				inputmode="email"
				autocapitalize="none"
				spellcheck="false"
				required
				bind:value={email}
			/>
		</label>

		<div class="flex flex-col gap-1.5">
			<label for="password" class="text-sm font-medium text-fg">{m.auth_password()}</label>
			<div class="flex items-center rounded-xl border border-border bg-surface focus-within:border-primary">
				<input
					id="password"
					class="min-w-0 flex-1 bg-transparent px-4 py-3 text-base text-fg outline-none"
					type={showPassword ? 'text' : 'password'}
					autocomplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
					aria-describedby={mode === 'sign-up' ? 'password-hint' : undefined}
					required
					bind:value={password}
				/>
				<button
					type="button"
					class="p-3 text-fg-muted"
					aria-label={m.auth_show_password()}
					aria-pressed={showPassword}
					onclick={() => (showPassword = !showPassword)}
				>
					<Icon name={showPassword ? 'eye-off' : 'eye'} class="size-5" />
				</button>
			</div>
			{#if mode === 'sign-up'}
				<span id="password-hint" class="text-xs text-fg-muted">{m.auth_password_hint()}</span>
			{/if}
		</div>

		{#if error}
			<p class="rounded-xl bg-surface-2 px-4 py-3 text-sm text-danger" role="alert">
				{ERROR_MESSAGES[error]()}
			</p>
		{/if}

		<button
			type="submit"
			class="rounded-full bg-primary py-3.5 text-base font-semibold text-on-primary disabled:opacity-60"
			disabled={busy}
		>
			{mode === 'sign-in' ? m.auth_submit_sign_in() : m.auth_submit_sign_up()}
		</button>
	</form>

	<a href={resolve('/privacy')} class="text-center text-sm font-medium text-primary-ink underline">
		{m.auth_privacy_link()}
	</a>

	<div class="mt-auto">
		<LanguageSwitcher />
	</div>
</main>
