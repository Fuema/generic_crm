// Light / dark / system theme. The choice is a per-browser convenience kept in
// localStorage; "system" follows the OS setting. The `.dark` class on <html>
// drives every color token in styles.css.

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

export function readTheme(): Theme {
	try {
		const value = localStorage.getItem(STORAGE_KEY);
		return value === "light" || value === "dark" ? value : "system";
	} catch {
		// Private mode or blocked storage: fall back to the OS setting
		return "system";
	}
}

export function applyTheme(theme: Theme) {
	const dark =
		theme === "dark" ||
		(theme === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", dark);
	document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function saveTheme(theme: Theme) {
	try {
		if (theme === "system") localStorage.removeItem(STORAGE_KEY);
		else localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		// Storage unavailable: the theme still applies for this page view
	}
	applyTheme(theme);
}

// Runs in <head> before the page paints, so a dark theme never flashes white.
// Kept tiny and self-contained: it can't import anything.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";}catch(_){}})();`;
