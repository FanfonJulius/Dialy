<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { getLocale, locales, setLocale, type Locale } from '#lib/paraglide/runtime.js';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';

	// Language names are shown in their own language so users can always find theirs.
	const names: Record<Locale, () => string> = { en: m.language_en, fr: m.language_fr };
	const options = locales.map((locale) => ({ value: locale, label: names[locale]() }));
</script>

<SegmentedControl
	name="language"
	legend={m.settings_language()}
	{options}
	value={getLocale()}
	onchange={(locale) => setLocale(locale)}
/>
