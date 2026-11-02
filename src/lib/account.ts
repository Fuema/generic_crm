import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "#/lib/auth";
import { requireSession } from "#/lib/auth-session";

// Linked sign-in methods for the current user. Guarded: returns 401 without a session.
export const getLinkedAccounts = createServerFn({ method: "GET" })
	.middleware([requireSession])
	.handler(async () => {
		const accounts = await auth.api.listUserAccounts({
			headers: getRequestHeaders(),
		});
		return {
			hasPassword: accounts.some((a) => a.providerId === "credential"),
			providers: accounts.map((a) => a.providerId),
		};
	});
