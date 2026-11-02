import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "#/lib/auth-session";

// "/" has no page of its own: signed-in users land on their dashboard (in the
// last-used workspace), everyone else on the sign-in page. Runs on the server
// for the first request, so no placeholder screen flashes.
export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const session = await getSession();
		throw redirect({ to: session ? "/dashboard" : "/login" });
	},
});
