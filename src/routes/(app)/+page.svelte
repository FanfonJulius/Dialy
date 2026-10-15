<script lang="ts">
	import MapScreen from '#lib/features/map/MapScreen.svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<h1 class="sr-only">{m.app_name()}</h1>
<MapScreen />
