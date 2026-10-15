<script lang="ts">
	import { untrack } from 'svelte';
	import { distanceMeters, type Bounds } from '#lib/domain/geo.js';
	import { matchesFilter, nearestPoints, type CashPoint, type PointFilter } from '#lib/domain/points.js';
	import DownloadAreaSheet from '#lib/features/areas/DownloadAreaSheet.svelte';
	import NewWithdrawalSheet from '#lib/features/withdraw/NewWithdrawalSheet.svelte';
	import { geolocation } from '#lib/location/geolocation.svelte.js';
	import MapView from '#lib/map/MapView.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import { connectivity } from '#lib/stores/connectivity.svelte.js';
	import { localData, pointsSync } from '#lib/stores/local-data.svelte.js';
	import { mapFocus } from '#lib/stores/map-focus.svelte.js';
	import { outbox } from '#lib/stores/outbox.svelte.js';
	import Icon from '#lib/ui/Icon.svelte';
	import MapSearch from './MapSearch.svelte';
	import NearbySheet from './NearbySheet.svelte';
	import PointCard from './PointCard.svelte';

	const NEARBY_LIMIT = 20;

	let mapView = $state<ReturnType<typeof MapView>>();
	let filter = $state<PointFilter>({ network: 'all', code: '' });
	let selectedId = $state<string | null>(null);
	let withdrawing = $state(false);
	/** The area shown when the user asked to download it. */
	let downloadBounds = $state.raw<Bounds | null>(null);
	let noticeDismissed = $state(false);
	let lastBounds = $state.raw<Bounds | null>(null);
	let bottomPanelHeight = $state(0);
	// Follow the first fix once, unless the user already moved the map themselves.
	let centeredOnUser = false;

	const visiblePoints = $derived(localData.points.filter((point) => matchesFilter(point, filter)));
	const selected = $derived(localData.points.find((point) => point.id === selectedId) ?? null);
	const nearby = $derived(
		geolocation.fix ? nearestPoints(visiblePoints, geolocation.fix, NEARBY_LIMIT) : []
	);
	const notice = $derived.by(() => {
		if (noticeDismissed) return null;
		if (geolocation.status === 'denied') return m.location_denied();
		if (geolocation.status === 'unsupported') return m.location_unsupported();
		if (geolocation.status === 'unavailable') return m.location_unavailable();
		return null;
	});

	$effect(() => {
		const fix = geolocation.fix;
		if (fix && !centeredOnUser && mapView) {
			centeredOnUser = true;
			mapView.flyTo(fix);
		}
	});

	// A point opened from another screen (e.g. Saved), once it is loaded from the device.
	$effect(() => {
		const id = mapFocus.pointId;
		const point = id ? localData.points.find((candidate) => candidate.id === id) : undefined;
		if (!point || !mapView) return;
		mapFocus.clear();
		centeredOnUser = true;
		select(point);
	});

	// Back online: fetch what changed in the current view.
	$effect(() => {
		if (!connectivity.online) return;
		const bounds = untrack(() => lastBounds);
		if (bounds) sync(bounds);
	});

	function sync(bounds: Bounds): void {
		lastBounds = bounds;
		if (!connectivity.online) return;
		pointsSync.syncArea(bounds).catch((error: unknown) => console.error('Points sync failed', error));
	}

	function select(point: CashPoint): void {
		withdrawing = false;
		downloadBounds = null;
		selectedId = point.id;
		mapView?.flyTo(point);
	}

	function recenter(): void {
		noticeDismissed = false;
		if (geolocation.fix) {
			centeredOnUser = true;
			mapView?.flyTo(geolocation.fix);
		} else {
			void geolocation.request();
		}
	}
</script>

<div class="relative size-full overflow-hidden">
	<MapView
		bind:this={mapView}
		points={visiblePoints}
		fix={geolocation.fix}
		{selectedId}
		bottomInset={bottomPanelHeight}
		onselect={(id) => {
			selectedId = id;
			if (id) withdrawing = false;
		}}
		onmoveend={sync}
		ondragstart={() => (centeredOnUser = true)}
	/>

	<div class="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
		<div class="pointer-events-auto flex items-start gap-2">
			<div class="min-w-0 flex-1">
				<MapSearch bind:filter networks={localData.networks} />
			</div>
			<div class="flex flex-col gap-2">
				<button
					type="button"
					class="rounded-full border border-border bg-surface p-3 text-fg shadow-md"
					aria-label={m.map_recenter()}
					onclick={recenter}
				>
					<Icon name="locate" class="size-5" />
				</button>
				<button
					type="button"
					class="rounded-full border border-border bg-surface p-3 text-fg shadow-md disabled:opacity-50"
					aria-label={m.areas_download()}
					disabled={!lastBounds}
					onclick={() => {
						selectedId = null;
						withdrawing = false;
						downloadBounds = lastBounds;
					}}
				>
					<Icon name="download" class="size-5" />
				</button>
			</div>
		</div>

		{#if !connectivity.online}
			<p class="self-center rounded-full bg-fg px-3 py-1 text-xs font-medium text-bg shadow" role="status">
				{m.map_offline()}
			</p>
		{/if}
		{#if outbox.pending > 0}
			<p class="self-center rounded-full bg-surface px-3 py-1 text-xs font-medium text-fg shadow" role="status">
				{m.map_pending({ count: String(outbox.pending) })}
			</p>
		{/if}

		{#if notice}
			<div
				class="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-surface p-3 text-sm text-fg shadow-md"
				role="status"
			>
				<p class="flex-1">{notice}</p>
				<button type="button" class="font-semibold text-primary-ink" onclick={() => (noticeDismissed = true)}>
					{m.dismiss()}
				</button>
			</div>
		{/if}
	</div>

	<div class="absolute inset-x-0 bottom-0" bind:clientHeight={bottomPanelHeight}>
		{#if selected}
			<PointCard
				point={selected}
				network={localData.networks.find((network) => network.id === selected.network)}
				networkName={localData.networkName(selected.network)}
				distanceM={geolocation.fix ? distanceMeters(geolocation.fix, selected) : null}
				onclose={() => (selectedId = null)}
			/>
		{:else if downloadBounds}
			<DownloadAreaSheet bounds={downloadBounds} onclose={() => (downloadBounds = null)} />
		{:else if withdrawing}
			<NewWithdrawalSheet
				networks={localData.networks}
				points={localData.points}
				fix={geolocation.fix}
				onselectpoint={select}
				onclose={() => (withdrawing = false)}
			/>
		{:else}
			<div class="flex justify-end px-3 pb-3">
				<button
					type="button"
					class="flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-base font-semibold text-on-primary shadow-lg"
					onclick={() => (withdrawing = true)}
				>
					<Icon name="phone" class="size-5" />
					{m.withdraw_start()}
				</button>
			</div>
			<NearbySheet items={nearby} networkName={(id) => localData.networkName(id)} onselect={select} />
		{/if}
	</div>
</div>
