import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { MailOpen } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { Button, buttonVariants } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { RoleBadge } from "#/components/Workspace/RoleBadge";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { m } from "#/paraglide/messages.js";

// Under _authed: a signed-out visitor is sent to /login and brought back here after
// signing in. Better Auth only lets the invited (verified) email address accept.
export const Route = createFileRoute(
	"/_authed/accept-invitation/$invitationId",
)({
	component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
	const router = useRouter();
	const { invitationId } = Route.useParams();
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const invitation = useQuery({
		queryKey: ["invitation", invitationId],
		queryFn: async () => {
			const { data, error } = await authClient.organization.getInvitation({
				query: { id: invitationId },
			});
			if (error) throw new Error(authErrorMessage(error));
			return data;
		},
		retry: false,
	});

	const accept = async () => {
		setPending(true);
		setError(null);
		const { data, error } = await authClient.organization.acceptInvitation({
			invitationId,
		});
		if (error || !data) {
			setPending(false);
			setError(authErrorMessage(error));
			return;
		}
		await authClient.organization.setActive({
			organizationId: data.invitation.organizationId,
		});
		await router.invalidate();
		await router.navigate({ to: "/projects" });
	};

	const decline = async () => {
		setPending(true);
		const { error } = await authClient.organization.rejectInvitation({
			invitationId,
		});
		setPending(false);
		if (error) return setError(authErrorMessage(error));
		await router.navigate({ to: "/dashboard" });
	};

	return (
		<div className="mx-auto max-w-xl p-6">
			<Card>
				<CardHeader className="text-center">
					<MailOpen
						className="mx-auto size-10 text-primary"
						aria-hidden="true"
					/>
					<CardTitle>{m.invitation_title()}</CardTitle>
					{invitation.data ? (
						<CardDescription>
							{m.invitation_invited_you({
								inviter: invitation.data.inviterEmail,
							})}{" "}
							<strong>{invitation.data.organizationName}</strong>.
						</CardDescription>
					) : null}
				</CardHeader>
				<CardContent className="space-y-4">
					{invitation.isPending ? (
						<p className="text-center text-sm text-muted-foreground">
							{m.invitation_loading()}
						</p>
					) : invitation.isError ? (
						<>
							<FormAlert message={invitation.error.message} />
							<Link
								to="/dashboard"
								className={buttonVariants({
									variant: "outline",
									className: "w-full",
								})}
							>
								{m.common_go_to_dashboard()}
							</Link>
						</>
					) : (
						<>
							<p className="flex items-center justify-center gap-2 text-sm">
								{m.invitation_your_role()}{" "}
								<RoleBadge role={invitation.data.role ?? "viewer"} />
							</p>
							<FormAlert message={error} />
							<div className="flex gap-2">
								<Button
									type="button"
									className="flex-1"
									onClick={accept}
									disabled={pending}
								>
									{pending ? m.common_joining() : m.invitation_accept_join()}
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={decline}
									disabled={pending}
								>
									{m.common_decline()}
								</Button>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
