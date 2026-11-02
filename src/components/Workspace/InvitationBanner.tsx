import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { MailOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { m } from "#/paraglide/messages.js";
import { RoleBadge } from "./RoleBadge";

const QUERY_KEY = ["my-invitations"];

// Pending invitations for the signed-in user, so they can join a workspace
// without needing the email link. Better Auth only returns invitations sent to
// the user's own verified address.
export function InvitationBanner() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const invitations = useQuery({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const { data, error } =
				await authClient.organization.listUserInvitations();
			if (error) throw new Error(authErrorMessage(error));
			// The endpoint returns pending invitations; hide ones that have expired
			return data.filter((i) => new Date(i.expiresAt) > new Date());
		},
		// Unverified users can't have invitations listed; don't retry noisily
		retry: false,
	});

	if (!invitations.data?.length) return null;

	const respond = async (
		invitationId: string,
		organizationId: string,
		accept: boolean,
	) => {
		setBusyId(invitationId);
		setError(null);
		const { error } = accept
			? await authClient.organization.acceptInvitation({ invitationId })
			: await authClient.organization.rejectInvitation({ invitationId });
		if (error) {
			setBusyId(null);
			setError(authErrorMessage(error));
			return;
		}
		if (accept) {
			// Open the workspace the user just joined
			await authClient.organization.setActive({ organizationId });
		}
		await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
		setBusyId(null);
		await router.invalidate();
		if (accept) await router.navigate({ to: "/projects" });
	};

	return (
		<section
			aria-label={m.invitations_label()}
			className="border-b bg-primary/5"
		>
			<ul className="mx-auto max-w-5xl divide-y divide-primary/10 px-4">
				{invitations.data.map((i) => (
					<li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
						<MailOpen
							className="size-5 shrink-0 text-primary"
							aria-hidden="true"
						/>
						<p className="flex flex-1 flex-wrap items-center gap-1.5 text-sm">
							{m.invitations_invited_to()} <strong>{i.organizationName}</strong>{" "}
							{m.invitations_as()} <RoleBadge role={i.role ?? "viewer"} />
						</p>
						<div className="flex gap-2">
							<Button
								type="button"
								size="sm"
								onClick={() => respond(i.id, i.organizationId, true)}
								disabled={busyId !== null}
							>
								{busyId === i.id ? m.common_joining() : m.invitations_accept()}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => respond(i.id, i.organizationId, false)}
								disabled={busyId !== null}
							>
								{m.common_decline()}
							</Button>
						</div>
					</li>
				))}
				{error ? (
					<li
						role="alert"
						className="py-2 text-sm font-medium text-destructive"
					>
						{error}
					</li>
				) : null}
			</ul>
		</section>
	);
}
