<script lang="ts" module>
	export type IconName = 'map' | 'bookmark' | 'user';
</script>

<script lang="ts">
	let { name, class: className = 'size-6' }: { name: IconName; class?: string } = $props();
</script>

<svg
	class={className}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'map'}
		<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" />
		<path d="M9 4v13.5M15 6.5V20" />
	{:else if name === 'bookmark'}
		<path d="M6 3.5h12V21l-6-4.2L6 21z" />
	{:else}
		<circle cx="12" cy="8" r="4" />
		<path d="M4 21c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5" />
	{/if}
</svg>
