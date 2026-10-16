<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { m } from '#lib/paraglide/messages.js';
	import Icon, { type IconName } from '#lib/ui/Icon.svelte';

	type Tab = {
		routeId: '/(app)' | '/(app)/saved' | '/(app)/donations' | '/(app)/profile';
		label: () => string;
		icon: IconName;
	};

	const tabs: readonly Tab[] = [
		{ routeId: '/(app)', label: m.nav_map, icon: 'map' },
		{ routeId: '/(app)/saved', label: m.nav_saved, icon: 'bookmark' },
		{ routeId: '/(app)/donations', label: m.nav_donations, icon: 'heart' },
		{ routeId: '/(app)/profile', label: m.nav_profile, icon: 'user' }
	];

	function isActive(tab: Tab): boolean {
		const current = page.route.id ?? '';
		return tab.routeId === '/(app)' ? current === tab.routeId : current.startsWith(tab.routeId);
	}
</script>

<nav aria-label={m.nav_label()} class="sticky bottom-0 border-t border-border bg-surface">
	<ul class="mx-auto grid max-w-md grid-cols-4 pb-[env(safe-area-inset-bottom)]">
		{#each tabs as tab (tab.routeId)}
			{@const active = isActive(tab)}
			<li>
				<a
					href={resolve(tab.routeId)}
					aria-current={active ? 'page' : undefined}
					class="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium {active
						? 'text-primary-ink'
						: 'text-fg-muted'}"
				>
					<Icon name={tab.icon} />
					<span>{tab.label()}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
