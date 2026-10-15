<script lang="ts">
	import { formatBytes, formatRelativeTime } from '#lib/i18n/format.js';
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { areas } from '#lib/stores/areas.svelte.js';
	import { connectivity } from '#lib/stores/connectivity.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';

	const locale = getLocale();
</script>

{#if areas.areas.length === 0}
	<div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
		<span class="rounded-full bg-surface-2 p-4 text-fg-muted">
			<Icon name="download" class="size-8" />
		</span>
		<p class="max-w-xs text-fg-muted">{m.areas_empty()}</p>
	</div>
{:else}
	<ul class="flex flex-col gap-2">
		{#each areas.areas as area (area.id)}
			{@const downloading = areas.active?.areaId === area.id}
			<li class="flex flex-col gap-2 rounded-2xl bg-surface p-4">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="truncate font-semibold text-fg">{area.name}</p>
						<p class="text-sm text-fg-muted">
							{#if downloading || area.status === 'downloading'}
								{m.areas_status_downloading()}
							{:else if area.status === 'incomplete'}
								{m.areas_status_incomplete()}
							{:else}
								{m.areas_details({
									size: formatBytes(area.bytes, locale),
									time: formatRelativeTime(new Date(area.updatedAt).toISOString(), locale)
								})}
							{/if}
						</p>
					</div>
				</div>
				<div class="flex gap-2">
					<button
						type="button"
						class="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-fg disabled:opacity-60"
						disabled={!connectivity.online || areas.active !== null}
						onclick={() => areas.update(area.id)}
					>
						{m.areas_update()}
					</button>
					<button
						type="button"
						class="rounded-full px-4 py-2 text-sm font-semibold text-danger"
						onclick={() => areas.remove(area.id)}
					>
						{m.areas_delete()}
					</button>
				</div>
			</li>
		{/each}
	</ul>
{/if}

{#if areas.storage}
	<p class="mt-6 text-center text-xs text-fg-muted">{m.areas_storage({ usage: formatBytes(areas.storage.usage, locale) })}</p>
{/if}
