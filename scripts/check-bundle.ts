// Fails if server-only code or secret values ended up in the browser bundle.
// Run after `bun run build` (or use `bun run check:bundle`, which builds first).
//
// Why: TanStack Start strips createServerFn handler bodies from the client
// bundle, but NOT plain exported functions. A db helper exported from a module
// that a route imports ships the database client to the browser and crashes
// the page ("DATABASE_URL is missing"). This happened once; this check keeps it
// from happening again.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CLIENT_DIR = "dist/client";

// Strings that only exist in server-side code
const SERVER_MARKERS = [
	"DATABASE_URL is missing", // src/db/index.ts guard
	"drizzle-orm/neon-http", // database driver
	"workspace_counter", // billing.server.ts
	"api.resend.com", // email sending
	"Choose a member of this workspace", // workspace-refs.server.ts
];

if (!existsSync(CLIENT_DIR)) {
	console.error(`${CLIENT_DIR} not found. Run \`bun run build\` first.`);
	process.exit(1);
}

const files = readdirSync(CLIENT_DIR, { recursive: true })
	.map(String)
	.filter((f) => /\.(js|mjs|html|css|json|map)$/.test(f))
	.map((f) => join(CLIENT_DIR, f));
const contents = files.map((f) => ({ file: f, text: readFileSync(f, "utf8") }));

let problems = 0;

for (const marker of SERVER_MARKERS) {
	const hits = contents.filter((c) => c.text.includes(marker)).map((c) => c.file);
	if (hits.length) {
		problems++;
		console.error(`SERVER CODE IN BROWSER BUNDLE: "${marker}" found in:\n  ${hits.join("\n  ")}`);
	}
}

// Secret values from the env files (VITE_* values are public by design)
const secrets = new Map<string, string>();
for (const envFile of [".env", ".env.local"]) {
	if (!existsSync(envFile)) continue;
	for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
		const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
		if (!m || m[1].startsWith("VITE_")) continue;
		const value = m[2].replace(/^["']|["']$/g, "");
		if (value.length >= 8) secrets.set(m[1], value);
	}
}
for (const [name, value] of secrets) {
	const hits = contents.filter((c) => c.text.includes(value)).map((c) => c.file);
	if (hits.length) {
		problems++;
		// Never print the value itself
		console.error(`SECRET VALUE IN BROWSER BUNDLE: ${name} found in:\n  ${hits.join("\n  ")}`);
	}
}

if (problems) {
	console.error(`\ncheck:bundle FAILED (${problems} problem${problems === 1 ? "" : "s"}).`);
	process.exit(1);
}
console.log(
	`check:bundle passed: ${files.length} browser files, ${SERVER_MARKERS.length} server markers and ${secrets.size} secret values checked.`,
);
