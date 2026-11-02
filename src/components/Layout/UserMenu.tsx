import { Link, useRouter } from "@tanstack/react-router";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
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
					aria-label={`Account menu for ${user.name}`}
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
						<ShieldCheck /> Security
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
					<Link to="/workspace/settings">
						<Settings /> Workspace settings
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => void signOut()} disabled={signingOut}>
					<LogOut /> {signingOut ? "Signing out..." : "Sign out"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
