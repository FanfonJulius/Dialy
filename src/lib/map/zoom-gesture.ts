/** Smaller zoom changes (e.g. from panning with two fingers) are not treated as zooming in or out. */
export const ZOOM_GESTURE_MIN = 0.3;

export function zoomGesture(startZoom: number, endZoom: number): 'in' | 'out' | null {
	const change = endZoom - startZoom;
	if (Math.abs(change) < ZOOM_GESTURE_MIN) return null;
	return change > 0 ? 'in' : 'out';
}
