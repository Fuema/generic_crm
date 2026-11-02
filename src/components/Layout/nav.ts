import {
	CalendarDays,
	FileText,
	FolderKanban,
	KanbanSquare,
	LayoutDashboard,
	type LucideIcon,
	Package,
	Settings,
	ShoppingCart,
	UserRound,
	Users,
} from "lucide-react";

export type NavItem = { title: string; to: string; icon: LucideIcon };

// Sidebar sections, in the order people work: customers, then what they buy
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
	{
		label: "Overview",
		items: [{ title: "Dashboard", to: "/dashboard", icon: LayoutDashboard }],
	},
	{
		label: "Sales",
		items: [
			{ title: "Customers", to: "/customers", icon: UserRound },
			{ title: "Products", to: "/products", icon: Package },
			{ title: "Orders", to: "/orders", icon: ShoppingCart },
			{ title: "Invoices", to: "/invoices", icon: FileText },
		],
	},
	{
		label: "Planning",
		items: [
			{ title: "Tasks", to: "/tasks", icon: KanbanSquare },
			{ title: "Calendar", to: "/calendar", icon: CalendarDays },
		],
	},
	{
		label: "Work",
		items: [{ title: "Projects", to: "/projects", icon: FolderKanban }],
	},
	{
		label: "Workspace",
		items: [
			{ title: "Members", to: "/workspace/members", icon: Users },
			{ title: "Settings", to: "/workspace/settings", icon: Settings },
		],
	},
];

const EXTRA_TITLES: [string, string][] = [
	["/orders/new", "New order"],
	["/workspace/new", "New workspace"],
	["/account/security", "Security"],
	["/accept-invitation", "Invitation"],
];

// Page title for the top bar: the longest matching nav path wins, so
// /orders/abc shows "Orders" and /orders/new shows "New order"
export function titleForPath(pathname: string) {
	const candidates: [string, string][] = [
		...NAV_GROUPS.flatMap((g) =>
			g.items.map((i) => [i.to, i.title] as [string, string]),
		),
		...EXTRA_TITLES,
	];
	const match = candidates
		.filter(([path]) => pathname === path || pathname.startsWith(`${path}/`))
		.sort((a, b) => b[0].length - a[0].length)[0];
	return match?.[1] ?? "";
}
