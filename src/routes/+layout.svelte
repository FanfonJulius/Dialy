<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { getLocale } from '#lib/paraglide/runtime.js';
	import { theme } from '#lib/stores/theme.svelte.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		document.documentElement.lang = getLocale();
		theme.init();
	});
</script>

{@render children()}
