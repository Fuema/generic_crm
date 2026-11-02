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
import { m } from "#/paraglide/messages.js";

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
				<ArrowLeft className="size-4" /> {m.common_dashboard()}
			</Link>
			<h1 className="text-2xl font-bold">{m.security_title()}</h1>

			<Section
				title={m.security_2fa_title()}
				description={m.security_2fa_description()}
			>
				<TwoFactorSettings
					enabled={Boolean(session.user.twoFactorEnabled)}
					hasPassword={hasPassword}
				/>
			</Section>
			<Section
				title={m.security_passkeys_title()}
				description={m.security_passkeys_description()}
			>
				<PasskeySettings />
			</Section>
			{hasPassword ? (
				<Section
					title={m.security_password_title()}
					description={m.security_password_description()}
				>
					<ChangePasswordForm />
				</Section>
			) : null}
			<Section
				title={m.security_devices_title()}
				description={m.security_devices_description()}
			>
				<SessionList currentSessionId={session.session.id} />
			</Section>
		</div>
	);
}
