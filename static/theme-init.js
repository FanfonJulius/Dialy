// Runs before first paint to avoid a light/dark flash. Mirrors resolveTheme() in src/lib/domain/theme.ts.
(function () {
	var colors = { light: '#f6f5f2', dark: '#121212' };
	var theme = 'light';
	try {
		var preference = localStorage.getItem('daily.theme');
		var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		theme = preference === 'dark' || (preference !== 'light' && systemDark) ? 'dark' : 'light';
	} catch (error) {
		// Storage can be blocked (private mode); the light theme is a safe default.
	}
	document.documentElement.dataset.theme = theme;
	var meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', colors[theme]);
})();
