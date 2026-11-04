// The parts of the Workers runtime this app uses. In production and in
// `bun run dev` (the Cloudflare Vite plugin runs the server in Miniflare) the
// module exists; under plain Bun (tests, scripts) importing it fails.
declare module "cloudflare:workers" {
	export const env: {
		// Private R2 bucket for uploaded files (wrangler.jsonc r2_buckets)
		FILES?: import("./storage.server").BucketLike;
	};
}
