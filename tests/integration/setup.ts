// Preloaded by `bun run test:integration`, before any test imports #/db/index.
// Points the app's database client at the dedicated Neon `test` branch and
// refuses to run against anything else.
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
	throw new Error(
		"TEST_DATABASE_URL is missing: add the Neon `test` branch URL to .env.local (spec §5)",
	);
}
if (testUrl === process.env.DATABASE_URL) {
	throw new Error(
		"TEST_DATABASE_URL equals DATABASE_URL: integration tests must never run against the dev database",
	);
}
process.env.DATABASE_URL = testUrl;
