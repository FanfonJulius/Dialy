<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { hideLaunchScreen, releaseKeyboardOnLeave } from '#lib/pwa/launch.js';
	import { install } from '#lib/stores/install.svelte.js';
	import { theme } from '#lib/stores/theme.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		document.documentElement.lang = getLocale();
		theme.init();
		// Listens from the first screen on: the browser offers installing only once per visit.
		install.start();
		// Daily always opens without the keyboard, also after coming back from the dialer.
		releaseKeyboardOnLeave();
		// The first screen (map, sign-in or onboarding) is on the page now.
		hideLaunchScreen();
	});
</script>

{@render children()}
