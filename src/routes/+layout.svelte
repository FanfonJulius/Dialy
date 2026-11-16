<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { hideLaunchScreen, openWithoutKeyboard } from '#lib/pwa/launch.js';
	import { install } from '#lib/stores/install.svelte.js';
	import { theme } from '#lib/stores/theme.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Before any screen mounts, so the map starts in the right light or dark style.
	theme.init();

	onMount(() => {
		document.documentElement.lang = getLocale();
		// Listens from the first screen on: the browser offers installing only once per visit.
		install.start();
		// Daily always opens on the map without the keyboard, also when coming back from the dialer.
		openWithoutKeyboard();
		// The first screen (map, sign-in or onboarding) is on the page now.
		hideLaunchScreen();
	});
</script>

{@render children()}
