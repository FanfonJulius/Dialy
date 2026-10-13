<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { serviceWorkerUpdates } from '#lib/pwa/service-worker-updates.svelte.js';
	import { theme } from '#lib/stores/theme.svelte.js';
	import UpdateBanner from '#lib/ui/UpdateBanner.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		document.documentElement.lang = getLocale();
		theme.init();
		void serviceWorkerUpdates.init();
	});
</script>

<UpdateBanner />
{@render children()}
