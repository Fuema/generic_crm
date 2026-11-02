import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { ChangePasswordForm } from "#/components/Auth/security/ChangePasswordForm";
import { PasskeySettings } from "#/components/Auth/security/PasskeySettings";
import { SessionList } from "#/components/Auth/security/SessionList";
import { TwoFactorSettings } from "#/components/Auth/security/TwoFactorSettings";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { getLinkedAccounts } from "#/lib/account";

// Protected by the _authed layout guard
export const Route = createFileRoute("/_authed/account/security")({
	loader: () => getLinkedAccounts(),
	component: SecurityPage,
});

function Section({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: ReactNode;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

function SecurityPage() {
	const { session } = Route.useRouteContext();
	const { hasPassword } = Route.useLoaderData();

	return (
		<div className="mx-auto max-w-3xl space-y-6 p-6">
			<Link
				to="/dashboard"
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
			>
				<ArrowLeft className="size-4" /> Dashboard
			</Link>
			<h1 className="text-2xl font-bold">Security</h1>

			<Section
				title="Two-factor authentication"
				description="Add a second step when signing in with a password"
			>
				<TwoFactorSettings
					enabled={Boolean(session.user.twoFactorEnabled)}
					hasPassword={hasPassword}
				/>
			</Section>
			<Section
				title="Passkeys"
				description="Passwordless sign-in with your device"
			>
				<PasskeySettings />
			</Section>
			{hasPassword ? (
				<Section
					title="Password"
					description="Use a long password you don't use anywhere else"
				>
					<ChangePasswordForm />
				</Section>
			) : null}
			<Section
				title="Signed-in devices"
				description="Review and revoke active sessions"
			>
				<SessionList currentSessionId={session.session.id} />
			</Section>
		</div>
	);
}
