<script lang="ts">
	let { network, name }: { network: string; name: string } = $props();

	const background: Record<string, string> = { mtn: 'bg-net-mtn', orange: 'bg-net-orange' };
</script>

<span
	class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-on-network {background[
		network
	] ?? 'bg-surface-2'}"
>
	{name}
</span>
