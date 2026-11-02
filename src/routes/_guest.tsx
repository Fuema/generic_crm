import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSession } from "#/lib/auth-session";

// Guard for pages only signed-out visitors should see (sign-in, sign-up, password reset, 2FA step)
export const Route = createFileRoute("/_guest")({
	beforeLoad: async () => {
		if (await getSession()) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: Outlet,
});
