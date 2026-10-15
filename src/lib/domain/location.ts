import { distanceMeters, type LatLng } from './geo.ts';

export type Fix = LatLng & { accuracy: number; timestamp: number };

export const MIN_FIX_INTERVAL_MS = 1000;
export const MIN_MOVEMENT_M = 3;
export const MIN_ACCURACY_CHANGE = 0.2;

/** Whether a new GPS fix is worth re-rendering (limits redraws and battery use). */
export function isSignificantFix(previous: Fix | null, next: Fix): boolean {
	if (!previous) return true;
	if (next.timestamp - previous.timestamp < MIN_FIX_INTERVAL_MS) return false;
	const moved = distanceMeters(previous, next) >= MIN_MOVEMENT_M;
	const accuracyChanged = Math.abs(next.accuracy - previous.accuracy) >= previous.accuracy * MIN_ACCURACY_CHANGE;
	return moved || accuracyChanged;
}
