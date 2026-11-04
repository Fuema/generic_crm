// Server-only: where uploaded files' bytes live (spec §9). One interface:
// - production: the private R2 bucket bound as FILES (wrangler.jsonc);
// - `bun run dev`: the same binding, which Miniflare keeps on local disk under
//   .wrangler/state (git-ignored), so nothing paid is needed while building;
// - integration tests (plain Bun, NODE_ENV=test): an in-memory store.
// Anything else without the binding refuses to store, never silently.

// The R2 calls used here (a subset of R2Bucket)
export type BucketLike = {
	put(
		key: string,
		value: ReadableStream | ArrayBuffer,
		options?: { httpMetadata?: { contentType?: string } },
	): Promise<unknown>;
	get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
	delete(keys: string | string[]): Promise<void>;
	list(options: { prefix: string; cursor?: string; limit?: number }): Promise<{
		objects: { key: string }[];
		truncated: boolean;
		cursor?: string;
	}>;
};

const memory = new Map<string, ArrayBuffer>();
const memoryBucket: BucketLike = {
	async put(key, value) {
		memory.set(key, await new Response(value).arrayBuffer());
	},
	async get(key) {
		const bytes = memory.get(key);
		if (!bytes) return null;
		return { body: new Blob([bytes]).stream(), size: bytes.byteLength };
	},
	async delete(keys) {
		for (const key of Array.isArray(keys) ? keys : [keys]) memory.delete(key);
	},
	async list({ prefix }) {
		return {
			objects: [...memory.keys()]
				.filter((key) => key.startsWith(prefix))
				.map((key) => ({ key })),
			truncated: false,
		};
	},
};

type FixedLength = new (
	size: number,
) => { readable: ReadableStream; writable: WritableStream };

// R2 needs a stream of known length; on Workers (and Miniflare) a
// FixedLengthStream also fails the upload if the body isn't exactly `size`
// bytes. Elsewhere (tests) the store reads the whole body and checks it.
export function sizedBody(body: ReadableStream, size: number) {
	const Fixed = (globalThis as { FixedLengthStream?: FixedLength })
		.FixedLengthStream;
	if (!Fixed) return body;
	const fixed = new Fixed(size);
	void body.pipeTo(fixed.writable).catch(() => {});
	return fixed.readable;
}

// Every object of a workspace, when the workspace is deleted. Up to 50 pages
// of 1,000 keys (the 1 GB quota is far fewer files)
export async function deleteWorkspaceObjects(workspaceId: string) {
	const bucket = await fileBucket();
	const prefix = `workspace/${workspaceId}/`;
	let cursor: string | undefined;
	for (let page = 0; page < 50; page++) {
		const listed = await bucket.list({ prefix, cursor, limit: 1000 });
		const keys = listed.objects.map((o) => o.key);
		if (keys.length) await bucket.delete(keys);
		if (!listed.truncated) break;
		cursor = listed.cursor;
	}
}

let cached: BucketLike | null = null;

export async function fileBucket(): Promise<BucketLike> {
	if (cached) return cached;
	try {
		const { env } = await import("cloudflare:workers");
		if (env.FILES) {
			cached = env.FILES;
			return cached;
		}
	} catch {
		// Not running on the Workers runtime
	}
	if (process.env.NODE_ENV === "test") {
		cached = memoryBucket;
		return cached;
	}
	throw new Error("File storage isn't configured: bind an R2 bucket as FILES");
}

// Keys never contain the original name: workspace/<id>/<uuid>
export function storageKey(workspaceId: string) {
	return `workspace/${workspaceId}/${crypto.randomUUID()}`;
}
