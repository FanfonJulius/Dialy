<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import OutboxNotice from '#lib/features/withdraw/OutboxNotice.svelte';
	import { geolocation } from '#lib/location/geolocation.svelte.js';
	import { areas } from '#lib/stores/areas.svelte.js';
	import { connectivity } from '#lib/stores/connectivity.svelte.js';
	import { history } from '#lib/stores/history.svelte.js';
	import { localData } from '#lib/stores/local-data.svelte.js';
	import { mapChrome } from '#lib/stores/map-chrome.svelte.js';
	import { outbox } from '#lib/stores/outbox.svelte.js';
	import { saved } from '#lib/stores/saved.svelte.js';
	import { session } from '#lib/stores/session.svelte.js';
	import TabBar from '#lib/ui/TabBar.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		connectivity.start();
		localData.start();
		outbox.start();
		saved.start();
		history.start();
		areas.start();
		void localData.refreshNetworks();
		// Location is used only while the app screens are open and visible.
		geolocation.start();
		return () => geolocation.stop();
	});

	// Signed out here or in another tab: leave the app screens.
	$effect(() => {
		if (!session.user) void goto(resolve('/auth'), { replace: true });
	});
</script>

<OutboxNotice />
<div class="flex h-dvh flex-col">
	<main class="flex min-h-0 flex-1 flex-col overflow-y-auto">
		{@render children()}
	</main>
	{#if !mapChrome.hidden}
		<div transition:slide={{ duration: 200 }}>
			<TabBar />
		</div>
	{/if}
</div>
