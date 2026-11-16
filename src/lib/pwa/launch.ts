const LAUNCH_ID = 'launch';
const FADE_MS = 200;
/** Startup work that the first screen does not need waits at most this long for an idle moment. */
const IDLE_TIMEOUT_MS = 3000;

/** Fades out the launch screen drawn by app.html; called once the first screen has rendered. */
export function hideLaunchScreen(): void {
	const launch = document.getElementById(LAUNCH_ID);
	if (!launch) return;
	launch.classList.add('launch-done');
	// Taken out of the page once faded (with reduced motion it simply disappears).
	setTimeout(() => launch.remove(), FADE_MS + 50);
}

/**
 * Runs `task` once the browser is idle (or after IDLE_TIMEOUT_MS), so it does not compete with the
 * first screen's requests on a slow connection.
 */
export function whenIdle(task: () => void): void {
	if ('requestIdleCallback' in window) {
		window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
	} else {
		setTimeout(task, IDLE_TIMEOUT_MS / 3);
	}
}

/** Fields that bring up the phone's keyboard while they have the focus. */
const KEYBOARD_FIELDS = 'input, textarea, select, [contenteditable]';

/**
 * A field still focused when Daily is left brings the keyboard back over the screen the next time Daily
 * is opened (iPhone keeps the app in memory, and tapping Dial there does not take the focus off the
 * amount field). So the field is let go whenever Daily goes to the background.
 */
export function releaseKeyboardOnLeave(): void {
	const release = (): void => {
		const field = document.activeElement;
		if (field instanceof HTMLElement && field.matches(KEYBOARD_FIELDS)) field.blur();
	};
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') release();
	});
	window.addEventListener('pagehide', release);
}
