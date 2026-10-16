<script lang="ts">
	import DonationForm from '#lib/features/donations/DonationForm.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import Icon from '#lib/ui/Icon.svelte';
</script>

<section class="mx-auto flex w-full max-w-md flex-col gap-6 p-4">
	<h1 class="text-2xl font-bold text-fg">{m.nav_donations()}</h1>
	<div class="flex flex-col gap-5 rounded-2xl bg-surface p-4">
		<div class="flex items-start gap-3">
			<span class="shrink-0 rounded-full bg-surface-2 p-2.5 text-primary-ink">
				<Icon name="heart" class="size-5" />
			</span>
			<p class="text-sm text-fg-muted">{m.donations_intro()}</p>
		</div>
		<DonationForm />
	</div>
</section>
