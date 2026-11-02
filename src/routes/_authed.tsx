import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "#/components/Layout/AppSidebar";
import { SiteHeader } from "#/components/Layout/SiteHeader";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { InvitationBanner } from "#/components/Workspace/InvitationBanner";
import { getSession } from "#/lib/auth-session";
import { getWorkspaceAccess } from "#/lib/authz";

// Guard for every page under _authed/. The session check runs on the server, so
// signed-out visitors are redirected before any protected page renders.
export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ location }) => {
		const session = await getSession();
		if (!session) {
			throw redirect({ to: "/login", search: { redirect: location.href } });
		}
		// Role and permissions in the active workspace, for showing/hiding UI
		const access = await getWorkspaceAccess();
		return { session, access };
	},
	component: AuthedLayout,
});

function AuthedLayout() {
	const { session, access } = Route.useRouteContext();
	return (
		<SidebarProvider>
			<AppSidebar access={access} />
			<SidebarInset className="bg-muted/40 print:bg-white">
				<SiteHeader user={session.user} role={access?.role} />
				<div className="print:hidden">
					<InvitationBanner />
				</div>
				<main className="flex-1">
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
