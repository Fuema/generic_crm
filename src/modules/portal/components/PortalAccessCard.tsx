import { useRouter } from "@tanstack/react-router";
import { MailPlus, UserX } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import { Label } from "#/components/ui/label";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import {
	type ContactPortal,
	inviteToPortal,
	revokePortal,
	setPortalCompanyAccess,
} from "../portal";

const when = (value: Date | string) =>
	new Date(value).toLocaleString(getLocale());

// A contact's access to the customer portal, on their page (editors and up
// invite and revoke; the server checks again)
export function PortalAccessCard({
	contactId,
	hasEmail,
	hasCompany,
	portal,
	canEdit,
	className,
}: {
	contactId: string;
	hasEmail: boolean;
	hasCompany: boolean;
	portal: ContactPortal;
	canEdit: boolean;
	className?: string;
}) {
	const router = useRouter();
	const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const [busy, setBusy] = useState(false);
	const access = portal.access;
	const active = access !== null && access.revokedAt === null;

	const run = async (action: () => Promise<unknown>, ok: string) => {
		setBusy(true);
		try {
			await action();
			setNotice({ ok: true, message: ok });
			await router.invalidate();
		} catch (e) {
			setNotice({ ok: false, message: await serverErrorMessage(e) });
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card className={className}>
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
				<CardTitle>{m.portal_card_title()}</CardTitle>
				{canEdit ? (
					<div className="flex gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={busy || !hasEmail}
							title={hasEmail ? undefined : m.error_portal_no_email()}
							onClick={() =>
								run(
									() => inviteToPortal({ data: { contactId } }),
									m.portal_invite_sent(),
								)
							}
						>
							<MailPlus /> {active ? m.portal_resend() : m.portal_invite()}
						</Button>
						{active ? (
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={busy}
								onClick={() => {
									if (!window.confirm(m.portal_revoke_confirm())) return;
									void run(
										() => revokePortal({ data: { contactId } }),
										m.portal_revoked(),
									);
								}}
							>
								<UserX /> {m.portal_revoke()}
							</Button>
						) : null}
					</div>
				) : null}
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				<FormAlert
					message={notice?.message ?? null}
					variant={notice?.ok ? "success" : "destructive"}
				/>
				<p className="text-muted-foreground">
					{!access
						? m.portal_status_none()
						: access.revokedAt
							? m.portal_status_revoked({ date: when(access.revokedAt) })
							: access.lastSignInAt
								? m.portal_status_active({
										date: when(access.lastSignInAt),
										sessions: portal.sessions,
									})
								: m.portal_status_invited({ date: when(access.invitedAt) })}
				</p>
				{active && hasCompany ? (
					<div className="flex items-center gap-2">
						<Checkbox
							id={`portal-company-${contactId}`}
							checked={access.companyAccess}
							disabled={!canEdit || busy}
							onCheckedChange={(c) =>
								run(
									() =>
										setPortalCompanyAccess({
											data: { contactId, companyAccess: c === true },
										}),
									c === true
										? m.portal_company_on_notice()
										: m.portal_company_off_notice(),
								)
							}
						/>
						<Label
							htmlFor={`portal-company-${contactId}`}
							className="font-normal"
						>
							{m.portal_company_access()}
						</Label>
					</div>
				) : null}
				{!hasEmail ? (
					<p className="text-xs text-muted-foreground">
						{m.error_portal_no_email()}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
