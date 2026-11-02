import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "#/components/ui/sidebar";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import type { WorkspaceAccess } from "#/lib/authz";
import { ROLE_LABELS, type WorkspaceRole } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";
import { NAV_GROUPS } from "./nav";

export function AppLogo({ className = "size-8" }: { className?: string }) {
	return (
		<svg viewBox="0 0 32 32" className={className} aria-hidden="true">
			<rect width="32" height="32" rx="8" className="fill-primary" />
			<path
				d="M9 21.5 14 11l4 7 2.5-4L23 21.5"
				fill="none"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="stroke-primary-foreground"
			/>
		</svg>
	);
}

function initial(name: string) {
	return name.trim().charAt(0).toUpperCase() || "W";
}

function WorkspaceSwitcher({ access }: { access: WorkspaceAccess }) {
	const router = useRouter();
	const { isMobile } = useSidebar();
	const current = access.workspace?.name ?? m.shell_workspace_fallback();

	const switchTo = async (organizationId: string) => {
		if (organizationId === access.organizationId) return;
		const { error } = await authClient.organization.setActive({
			organizationId,
		});
		if (error) {
			window.alert(authErrorMessage(error));
			return;
		}
		// Re-run the guards so role, permissions and data reload for the new workspace
		await router.invalidate();
	};

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							aria-label={m.shell_switch_workspace({ name: current })}
						>
							<span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-sm font-semibold">
								{initial(current)}
							</span>
							<span className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{current}</span>
								<span className="truncate text-xs text-muted-foreground">
									{ROLE_LABELS[access.role as WorkspaceRole]?.label() ??
										access.role}
								</span>
							</span>
							<ChevronsUpDown className="ml-auto" aria-hidden="true" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="min-w-56"
						side={isMobile ? "bottom" : "right"}
						align="start"
					>
						<DropdownMenuLabel className="text-xs text-muted-foreground">
							{m.shell_workspaces()}
						</DropdownMenuLabel>
						{access.workspaces.map((w) => (
							<DropdownMenuItem key={w.id} onSelect={() => void switchTo(w.id)}>
								<span className="flex size-6 items-center justify-center rounded-sm border text-xs">
									{initial(w.name)}
								</span>
								<span className="truncate">{w.name}</span>
								{w.id === access.organizationId ? (
									<Check className="ml-auto" aria-label={m.common_current()} />
								) : null}
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuItem asChild>
							<Link to="/workspace/new">
								<Plus /> {m.nav_new_workspace()}
							</Link>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

export function AppSidebar({ access }: { access: WorkspaceAccess | null }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { isMobile, setOpenMobile } = useSidebar();
	const isActive = (to: string) =>
		pathname === to || pathname.startsWith(`${to}/`);

	return (
		<Sidebar collapsible="icon" className="print:hidden">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild tooltip={m.app_name()}>
							<Link to="/dashboard">
								<AppLogo />
								<span className="truncate text-base font-semibold">
									{m.app_name()}
								</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
				{access ? <WorkspaceSwitcher access={access} /> : null}
			</SidebarHeader>

			<SidebarContent>
				{NAV_GROUPS.map((group) => (
					<SidebarGroup key={group.id}>
						<SidebarGroupLabel>{group.label()}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{group.items.map((item) => (
									<SidebarMenuItem key={item.to}>
										<SidebarMenuButton
											asChild
											isActive={isActive(item.to)}
											tooltip={item.title()}
										>
											<Link
												to={item.to}
												aria-current={isActive(item.to) ? "page" : undefined}
												// Close the mobile drawer after choosing a page
												onClick={() => isMobile && setOpenMobile(false)}
											>
												<item.icon />
												<span>{item.title()}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>

			<SidebarFooter>
				<p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
					{access?.workspace?.name ?? ""}
				</p>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
