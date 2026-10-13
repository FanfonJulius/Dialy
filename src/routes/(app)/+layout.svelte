<script lang="ts">
	import TabBar from '#lib/ui/TabBar.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="flex min-h-dvh flex-col">
	<main class="flex flex-1 flex-col">
		{@render children()}
	</main>
	<TabBar />
</div>
