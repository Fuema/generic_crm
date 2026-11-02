import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "#/lib/auth";

// Reads the Better Auth session from the request cookies on the server.
// Returns null when the visitor is signed out.
export const getSession = createServerFn({ method: "GET" }).handler(
	async () => {
		return auth.api.getSession({ headers: getRequestHeaders() });
	},
);

// Guard for server functions: rejects the call unless a valid session exists,
// and passes the session to the handler as `context.session`.
// Usage: createServerFn().middleware([requireSession]).handler(({ context }) => ...)
export const requireSession = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });
		if (!session) {
			throw new Response("Unauthorized", { status: 401 });
		}
		return next({ context: { session } });
	},
);
