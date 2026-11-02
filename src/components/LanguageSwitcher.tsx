import { m } from "#/paraglide/messages.js";
import { getLocale, type Locale, setLocale } from "#/paraglide/runtime.js";

const LABELS: Record<Locale, () => string> = {
	en: m.language_en,
	es: m.language_es,
};

// Saves the choice in the locale cookie and reloads, so the server renders the
// next page in the new language
export function LanguageSwitcher() {
	return (
		<label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
			{m.language_label()}
			<select
				className="rounded-md border bg-background px-2 py-1 text-foreground"
				value={getLocale()}
				onChange={(e) => setLocale(e.target.value as Locale)}
			>
				{Object.entries(LABELS).map(([locale, label]) => (
					<option key={locale} value={locale}>
						{label()}
					</option>
				))}
			</select>
		</label>
	);
}
