<script lang="ts">
	import type { OutboxEvent } from '#lib/sync/outbox.js';
	import type { WithdrawalRejection } from '#lib/domain/withdrawal.js';
	import { m } from '#lib/paraglide/messages.js';
	import { outbox } from '#lib/stores/outbox.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';

	const AUTO_DISMISS_MS = 8000;

	const REJECTIONS: Partial<Record<WithdrawalRejection, () => string>> = {
		location_inaccurate: m.notice_rejected_location_inaccurate,
		outside_service_area: m.notice_rejected_outside_service_area,
		daily_point_limit: m.notice_rejected_daily_point_limit,
		too_close: m.notice_rejected_too_close,
		daily_withdrawal_limit: m.notice_rejected_daily_withdrawal_limit,
		impossible_jump: m.notice_rejected_impossible_jump,
		location_required: m.notice_rejected_location_required,
		point_not_found: m.notice_rejected_point_gone,
		point_mismatch: m.notice_rejected_point_gone
	};

	function message(event: OutboxEvent): string {
		switch (event.type) {
			case 'withdrawal-recorded':
				return event.outcome === 'created' ? m.notice_point_created() : m.notice_withdrawal_recorded();
			case 'withdrawal-rejected':
				return (REJECTIONS[event.reason] ?? m.notice_rejected_other)();
			case 'saved-rejected':
				return m.notice_saved_failed();
		}
	}

	$effect(() => {
		if (!outbox.notice) return;
		const timer = setTimeout(() => outbox.dismiss(), AUTO_DISMISS_MS);
		return () => clearTimeout(timer);
	});
</script>

<div class="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
	{#if outbox.notice}
		<div
			class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl bg-fg p-3 text-sm text-bg shadow-lg"
			role="status"
		>
			<p class="flex-1">{message(outbox.notice)}</p>
			<button type="button" class="-m-1 rounded-full p-1" aria-label={m.dismiss()} onclick={() => outbox.dismiss()}>
				<Icon name="close" class="size-4" />
			</button>
		</div>
	{/if}
</div>
