import { Link, useRouter } from "@tanstack/react-router";
import { Check, Languages, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { RoleBadge } from "#/components/Workspace/RoleBadge";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { m } from "#/paraglide/messages.js";
import { getLocale, type Locale, setLocale } from "#/paraglide/runtime.js";

const LANGUAGES: { locale: Locale; label: () => string }[] = [
	{ locale: "en", label: m.language_en },
	{ locale: "es", label: m.language_es },
];

function initials(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	return (
		(
			(parts[0]?.[0] ?? "") +
			(parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
		).toUpperCase() || "?"
	);
}

export function UserMenu({
	user,
	role,
}: {
	user: { name: string; email: string; image?: string | null };
	role?: string;
}) {
	const router = useRouter();
	const [signingOut, setSigningOut] = useState(false);

	const signOut = async () => {
		setSigningOut(true);
		await authClient.signOut({
			fetchOptions: {
				onSuccess: async () => {
					await router.invalidate();
					await router.navigate({
						to: "/login",
						search: { notice: "signed-out" },
					});
				},
				onError: (ctx) => {
					setSigningOut(false);
					window.alert(authErrorMessage(ctx.error));
				},
			},
		});
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					className="h-9 gap-2 px-1.5"
					aria-label={m.shell_account_menu({ name: user.name })}
				>
					<Avatar className="size-7">
						{user.image ? <AvatarImage src={user.image} alt="" /> : null}
						<AvatarFallback className="text-xs">
							{initials(user.name)}
						</AvatarFallback>
					</Avatar>
					<span className="hidden max-w-32 truncate text-sm font-medium md:inline">
						{user.name}
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuLabel className="font-normal">
					<div className="flex items-center gap-3">
						<Avatar className="size-9">
							{user.image ? <AvatarImage src={user.image} alt="" /> : null}
							<AvatarFallback>{initials(user.name)}</AvatarFallback>
						</Avatar>
						<div className="grid min-w-0 flex-1">
							<span className="truncate font-medium">{user.name}</span>
							<span className="truncate text-xs text-muted-foreground">
								{user.email}
							</span>
						</div>
					</div>
					{role ? (
						<div className="mt-2">
							<RoleBadge role={role} />
						</div>
					) : null}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/account/security">
						<ShieldCheck /> {m.nav_security()}
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/workspace/settings">
						<Settings /> {m.shell_workspace_settings()}
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
					<Languages className="size-3.5" aria-hidden="true" />
					{m.language_label()}
				</DropdownMenuLabel>
				{LANGUAGES.map(({ locale, label }) => (
					// Saves the cookie and reloads, so the server renders the new language
					<DropdownMenuItem key={locale} onSelect={() => setLocale(locale)}>
						{label()}
						{getLocale() === locale ? (
							<Check className="ml-auto" aria-label={m.common_selected()} />
						) : null}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => void signOut()} disabled={signingOut}>
					<LogOut /> {signingOut ? m.shell_signing_out() : m.shell_sign_out()}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
