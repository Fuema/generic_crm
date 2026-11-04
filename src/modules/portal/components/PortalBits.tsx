import { useRouter } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "#/components/Layout/ThemeToggle";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { m } from "#/paraglide/messages.js";
import { getLocale, type Locale, setLocale } from "#/paraglide/runtime.js";
import { portalSignOut } from "../portal";

// The customer portal's own frame: the workspace's name, never the staff app.
// Branding (logo, accent color) arrives in phase 4 step 6.

function LanguageButtons() {
	const current = getLocale();
	return (
		<fieldset className="flex gap-1">
			<legend className="sr-only">{m.language_label()}</legend>
			{(["en", "es"] as Locale[]).map((locale) => (
				<Button
					key={locale}
					type="button"
					size="sm"
					variant={current === locale ? "secondary" : "ghost"}
					aria-pressed={current === locale}
					// Saves the cookie and reloads, so the server renders it too
					onClick={() => setLocale(locale)}
				>
					{locale.toUpperCase()}
				</Button>
			))}
		</fieldset>
	);
}

// Sign-in and link pages
export function PortalCard({
	workspaceName,
	title,
	description,
	children,
}: {
	workspaceName: string;
	title: string;
	description?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="relative flex min-h-svh items-center justify-center bg-muted/40 px-4 py-10">
			<div className="absolute top-3 right-3 flex items-center gap-2">
				<LanguageButtons />
				<ThemeToggle />
			</div>
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<p className="text-sm font-medium text-muted-foreground">
						{workspaceName}
					</p>
					<CardTitle className="text-2xl">{title}</CardTitle>
					{description ? (
						<CardDescription>{description}</CardDescription>
					) : null}
				</CardHeader>
				<CardContent className="space-y-4">{children}</CardContent>
			</Card>
		</div>
	);
}

// Signed-in pages
export function PortalShell({
	slug,
	workspaceName,
	contactName,
	children,
}: {
	slug: string;
	workspaceName: string;
	contactName: string;
	children: ReactNode;
}) {
	const router = useRouter();
	return (
		<div className="min-h-svh bg-muted/40">
			<header className="border-b bg-background">
				<div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
					<p className="font-semibold">{workspaceName}</p>
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<span className="text-muted-foreground">
							{m.portal_signed_in_as({ name: contactName })}
						</span>
						<LanguageButtons />
						<ThemeToggle />
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={async () => {
								await portalSignOut({ data: { slug } });
								await router.navigate({
									to: "/p/$slug/sign-in",
									params: { slug },
								});
							}}
						>
							<LogOut /> {m.portal_sign_out()}
						</Button>
					</div>
				</div>
			</header>
			<main className="mx-auto max-w-4xl space-y-6 px-4 py-6">{children}</main>
		</div>
	);
}
