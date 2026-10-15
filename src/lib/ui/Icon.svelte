<script lang="ts" module>
	export type IconName =
		| 'map'
		| 'bookmark'
		| 'bookmark-filled'
		| 'user'
		| 'search'
		| 'locate'
		| 'close'
		| 'chevron-up'
		| 'copy'
		| 'download'
		| 'phone'
		| 'eye'
		| 'eye-off';
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
	{:else if name === 'bookmark-filled'}
		<path d="M6 3.5h12V21l-6-4.2L6 21z" fill="currentColor" />
	{:else if name === 'user'}
		<circle cx="12" cy="8" r="4" />
		<path d="M4 21c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5" />
	{:else if name === 'search'}
		<circle cx="11" cy="11" r="6.5" />
		<path d="m16 16 4.5 4.5" />
	{:else if name === 'locate'}
		<circle cx="12" cy="12" r="6" />
		<circle cx="12" cy="12" r="1.5" fill="currentColor" />
		<path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6 6 18" />
	{:else if name === 'chevron-up'}
		<path d="m6 15 6-6 6 6" />
	{:else if name === 'copy'}
		<rect x="8.5" y="8.5" width="12" height="12" rx="2" />
		<path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" />
	{:else if name === 'download'}
		<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4.5 19.5h15" />
	{:else if name === 'phone'}
		<path
			d="M5 3.5h3.2l1.6 4.2-2.1 1.3a11 11 0 0 0 5.3 5.3l1.3-2.1 4.2 1.6V17a2 2 0 0 1-2 2A15.5 15.5 0 0 1 3 5.5a2 2 0 0 1 2-2z"
		/>
	{:else}
		<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
		<circle cx="12" cy="12" r="3" />
		{#if name === 'eye-off'}
			<path d="M3 3l18 18" />
		{/if}
	{/if}
</svg>
