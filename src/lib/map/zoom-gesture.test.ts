import { describe, expect, it } from 'vitest';
import { ZOOM_GESTURE_MIN, zoomGesture } from './zoom-gesture.ts';

describe('zoomGesture', () => {
	it('tells zooming in from zooming out', () => {
		expect(zoomGesture(14, 15.2)).toBe('in');
		expect(zoomGesture(15.2, 14)).toBe('out');
	});

	it('ignores the small zoom changes of a two-finger pan', () => {
		expect(zoomGesture(14, 14 + ZOOM_GESTURE_MIN / 2)).toBeNull();
		expect(zoomGesture(14, 14 - ZOOM_GESTURE_MIN / 2)).toBeNull();
	});
});
