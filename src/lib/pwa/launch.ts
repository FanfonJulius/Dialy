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
