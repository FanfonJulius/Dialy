<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { theme } from '#lib/stores/theme.svelte.js';
	import type { ThemePreference } from '#lib/domain/theme.js';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';

	const options: { value: ThemePreference; label: string }[] = $derived([
		{ value: 'system', label: m.theme_system() },
		{ value: 'light', label: m.theme_light() },
		{ value: 'dark', label: m.theme_dark() }
	]);
</script>

<SegmentedControl
	name="theme"
	legend={m.settings_theme()}
	{options}
	value={theme.preference}
	onchange={(preference) => theme.set(preference)}
/>
