// Fails when the message files don't have exactly the same keys, or a
// translation is empty (spec §14). Paraglide itself compiles a missing
// translation silently, so without this a Spanish page could quietly show
// English text.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "messages";
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const messages = Object.fromEntries(
	files.map((f) => {
		const { $schema: _, ...entries } = JSON.parse(
			readFileSync(join(dir, f), "utf8"),
		) as Record<string, unknown>;
		return [f.replace(/\.json$/, ""), entries];
	}),
);

const allKeys = new Set(Object.values(messages).flatMap((m) => Object.keys(m)));
const problems: string[] = [];
for (const [locale, entries] of Object.entries(messages)) {
	for (const key of allKeys) {
		const value = entries[key];
		if (value === undefined) problems.push(`${locale}: missing "${key}"`);
		else if (typeof value === "string" && value.trim() === "")
			problems.push(`${locale}: empty "${key}"`);
	}
}

if (problems.length) {
	console.error(`check:i18n failed:\n  ${problems.join("\n  ")}`);
	process.exit(1);
}
console.log(
	`check:i18n passed: ${allKeys.size} keys in ${files.length} locales (${Object.keys(messages).join(", ")}).`,
);
