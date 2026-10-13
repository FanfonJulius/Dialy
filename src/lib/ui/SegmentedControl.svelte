<script lang="ts" generics="T extends string">
	type Option = { value: T; label: string };

	let {
		name,
		legend,
		options,
		value,
		onchange
	}: {
		name: string;
		legend: string;
		options: readonly Option[];
		value: T;
		onchange: (value: T) => void;
	} = $props();
</script>

<fieldset>
	<legend class="mb-2 text-sm font-semibold text-fg">{legend}</legend>
	<div class="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-surface-2 p-1">
		{#each options as option (option.value)}
			<label
				class="flex min-h-12 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium text-fg-muted has-checked:bg-surface has-checked:text-fg has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-primary-ink"
			>
				<input
					type="radio"
					class="sr-only"
					{name}
					value={option.value}
					checked={option.value === value}
					onchange={() => onchange(option.value)}
				/>
				{option.label}
			</label>
		{/each}
	</div>
</fieldset>
