import {
	Building2,
	CalendarDays,
	Contact,
	FileSignature,
	FileText,
	FolderKanban,
	Handshake,
	Kanban,
	KanbanSquare,
	Layers,
	LayoutDashboard,
	type LucideIcon,
	Package,
	Settings,
	ShoppingCart,
	UserRound,
	Users,
} from "lucide-react";
import { m } from "#/paraglide/messages.js";

export type NavItem = { title: () => string; to: string; icon: LucideIcon };

// Sidebar sections, in the order people work: customers, then what they buy
export const NAV_GROUPS: {
	id: string;
	label: () => string;
	items: NavItem[];
}[] = [
	{
		id: "overview",
		label: m.nav_overview,
		items: [
			{ title: m.nav_dashboard, to: "/dashboard", icon: LayoutDashboard },
		],
	},
	{
		id: "contacts",
		label: m.nav_contacts_group,
		items: [
			{ title: m.nav_contacts, to: "/contacts", icon: Contact },
			{ title: m.nav_companies, to: "/companies", icon: Building2 },
		],
	},
	{
		id: "sales",
		label: m.nav_sales,
		items: [
			{ title: m.nav_deals, to: "/deals", icon: Handshake },
			{ title: m.nav_quotes, to: "/quotes", icon: FileSignature },
			{ title: m.nav_customers, to: "/customers", icon: UserRound },
			{ title: m.nav_products, to: "/products", icon: Package },
			{ title: m.nav_orders, to: "/orders", icon: ShoppingCart },
			{ title: m.nav_invoices, to: "/invoices", icon: FileText },
		],
	},
	{
		id: "planning",
		label: m.nav_planning,
		items: [
			{ title: m.nav_tasks, to: "/tasks", icon: KanbanSquare },
			{ title: m.nav_calendar, to: "/calendar", icon: CalendarDays },
		],
	},
	{
		id: "work",
		label: m.nav_work,
		items: [{ title: m.nav_projects, to: "/projects", icon: FolderKanban }],
	},
	{
		id: "workspace",
		label: m.nav_workspace,
		items: [
			{ title: m.nav_members, to: "/workspace/members", icon: Users },
			{ title: m.nav_settings, to: "/workspace/settings", icon: Settings },
			{ title: m.nav_fields, to: "/settings/fields", icon: Layers },
			{ title: m.nav_pipelines, to: "/settings/pipelines", icon: Kanban },
		],
	},
];

const EXTRA_TITLES: [string, () => string][] = [
	["/workspace/new", m.nav_new_workspace],
	["/account/security", m.nav_security],
	["/accept-invitation", m.nav_invitation],
];

// Page title for the top bar: the longest matching nav path wins, so
// /orders/abc shows "Orders" and /orders/new shows "New order"
export function titleForPath(pathname: string) {
	const candidates: [string, () => string][] = [
		...NAV_GROUPS.flatMap((g) =>
			g.items.map((i) => [i.to, i.title] as [string, () => string]),
		),
		...EXTRA_TITLES,
	];
	const match = candidates
		.filter(([path]) => pathname === path || pathname.startsWith(`${path}/`))
		.sort((a, b) => b[0].length - a[0].length)[0];
	return match?.[1]() ?? "";
}
