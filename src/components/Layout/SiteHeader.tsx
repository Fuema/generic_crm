import { useRouterState } from "@tanstack/react-router";
import { Separator } from "#/components/ui/separator";
import { SidebarTrigger } from "#/components/ui/sidebar";
import { titleForPath } from "./nav";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

// Top bar: sidebar toggle and page title on the left; theme and account on the right
export function SiteHeader({
	user,
	role,
}: {
	user: { name: string; email: string; image?: string | null };
	role?: string;
}) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const title = titleForPath(pathname);

	return (
		<header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
			<SidebarTrigger aria-label="Toggle sidebar" />
			<Separator
				orientation="vertical"
				className="mx-1 data-[orientation=vertical]:h-5"
			/>
			<p className="truncate text-sm font-medium">{title}</p>
			<div className="ml-auto flex items-center gap-1">
				<ThemeToggle />
				<UserMenu user={user} role={role} />
			</div>
		</header>
	);
}
