/** A point to open on the map, requested from another screen (e.g. Saved). */
class MapFocusStore {
	pointId = $state<string | null>(null);

	open(pointId: string): void {
		this.pointId = pointId;
	}

	clear(): void {
		this.pointId = null;
	}
}

export const mapFocus = new MapFocusStore();
