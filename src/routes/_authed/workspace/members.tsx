import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MailPlus, Trash2, UserRound, X } from "lucide-react";
import { useState } from "react";
import {
	FieldError,
	FormAlert,
	fieldErrors,
} from "#/components/Auth/FormParts";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { RoleBadge } from "#/components/Workspace/RoleBadge";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "#/lib/permissions";
import { inviteSchema } from "#/lib/schema";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

// Protected by the _authed layout guard. Every action below is also checked by
// Better Auth on the server against the caller's role in this workspace.
export const Route = createFileRoute("/_authed/workspace/members")({
	component: MembersPage,
});

type Status = { ok: boolean; message: string } | null;

function RoleSelect({
	value,
	onChange,
	disabled,
	id,
}: {
	value: string;
	onChange: (role: string) => void;
	disabled?: boolean;
	id?: string;
}) {
	return (
		<Select value={value} onValueChange={onChange} disabled={disabled}>
			<SelectTrigger id={id} className="w-32" aria-label={m.common_role()}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{ASSIGNABLE_ROLES.map((r) => (
					<SelectItem key={r} value={r}>
						{ROLE_LABELS[r].label()}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function InviteForm({ onInvited }: { onInvited: (email: string) => void }) {
	const [error, setError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: {
			email: "",
			role: "viewer" as (typeof ASSIGNABLE_ROLES)[number],
		},
		validators: { onBlur: inviteSchema, onSubmit: inviteSchema },
		onSubmit: async ({ value, formApi }) => {
			setError(null);
			const email = value.email.trim().toLowerCase();
			const { error } = await authClient.organization.inviteMember({
				email,
				role: value.role,
			});
			if (error) {
				setError(authErrorMessage(error));
				return;
			}
			formApi.reset();
			onInvited(email);
		},
	});

	return (
		<form
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-3"
		>
			<FormAlert message={error} />
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start">
				<form.Field name="email">
					{(field) => (
						<div className="flex-1 space-y-2">
							<Label htmlFor="invite-email">{m.common_email()}</Label>
							<Input
								id="invite-email"
								type="email"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder={m.members_invite_placeholder()}
								autoComplete="off"
								maxLength={254}
								aria-invalid={fieldErrors(field.state.meta).length > 0}
								aria-describedby="invite-email-error"
							/>
							<FieldError id="invite-email-error" meta={field.state.meta} />
						</div>
					)}
				</form.Field>
				<form.Field name="role">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor="invite-role">{m.common_role()}</Label>
							<RoleSelect
								id="invite-role"
								value={field.state.value}
								onChange={(r) =>
									field.handleChange(r as (typeof ASSIGNABLE_ROLES)[number])
								}
							/>
						</div>
					)}
				</form.Field>
				<form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
					{([canSubmit, isSubmitting]) => (
						<Button
							type="submit"
							className="sm:mt-[22px]"
							disabled={!canSubmit || isSubmitting}
						>
							<MailPlus />{" "}
							{isSubmitting ? m.common_sending() : m.members_invite()}
						</Button>
					)}
				</form.Subscribe>
			</div>
			<ul className="space-y-1 text-xs text-muted-foreground">
				{ASSIGNABLE_ROLES.map((r) => (
					<li key={r}>
						<span className="font-medium text-foreground">
							{ROLE_LABELS[r].label()}:
						</span>{" "}
						{ROLE_LABELS[r].description()}
					</li>
				))}
			</ul>
		</form>
	);
}

function MembersPage() {
	const { access } = Route.useRouteContext();
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<Status>(null);
	const queryKey = ["workspace", access?.organizationId, "full"];

	const workspace = useQuery({
		queryKey,
		queryFn: async () => {
			const { data, error } =
				await authClient.organization.getFullOrganization();
			if (error) throw new Error(authErrorMessage(error));
			return data;
		},
		enabled: Boolean(access),
	});

	const refresh = () => queryClient.invalidateQueries({ queryKey });

	const run = async (
		action: () => Promise<{ error: unknown }>,
		success: string,
	) => {
		setStatus(null);
		const { error } = await action();
		setStatus(
			error
				? {
						ok: false,
						message: authErrorMessage(
							error as Parameters<typeof authErrorMessage>[0],
						),
					}
				: { ok: true, message: success },
		);
		await refresh();
	};

	if (!access) {
		return (
			<p className="p-6 text-sm text-muted-foreground">
				{m.common_not_in_workspace()}
			</p>
		);
	}

	const pending =
		workspace.data?.invitations.filter((i) => i.status === "pending") ?? [];

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6">
			<div>
				<h1 className="text-2xl font-bold">{m.members_title()}</h1>
				<p className="text-sm text-muted-foreground">
					{m.members_people_in({
						workspace: access.workspace?.name ?? m.members_this_workspace(),
					})}
				</p>
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			{access.can.invite ? (
				<Card>
					<CardHeader>
						<CardTitle>{m.members_invite_title()}</CardTitle>
						<CardDescription>{m.members_invite_description()}</CardDescription>
					</CardHeader>
					<CardContent>
						<InviteForm
							onInvited={async (email) => {
								setStatus({
									ok: true,
									message: m.members_invitation_sent({ email }),
								});
								await refresh();
							}}
						/>
					</CardContent>
				</Card>
			) : null}

			{workspace.isPending ? (
				<p className="text-sm text-muted-foreground">{m.members_loading()}</p>
			) : workspace.isError ? (
				<FormAlert message={workspace.error.message} />
			) : (
				<>
					<ul
						className="divide-y rounded-lg border bg-background"
						aria-label={m.members_list()}
					>
						{workspace.data?.members.map((member) => {
							const isSelf = member.userId === access.userId;
							// Only an owner may change or remove another owner; nobody edits themselves here
							const editable =
								access.can.manageMembers &&
								!isSelf &&
								(member.role !== "owner" || access.role === "owner");
							return (
								<li
									key={member.id}
									className="flex flex-wrap items-center gap-3 p-4"
								>
									<UserRound
										className="size-5 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium">
											{member.user.name}
											{isSelf ? (
												<span className="text-muted-foreground">
													{" "}
													{m.members_you()}
												</span>
											) : null}
										</p>
										<p className="truncate text-sm text-muted-foreground">
											{member.user.email}
										</p>
									</div>
									{editable && member.role !== "owner" ? (
										<RoleSelect
											value={member.role}
											onChange={(role) =>
												run(
													() =>
														authClient.organization.updateMemberRole({
															memberId: member.id,
															role: role as (typeof ASSIGNABLE_ROLES)[number],
														}),
													m.members_role_changed({
														name: member.user.name,
														role: ROLE_LABELS[
															role as (typeof ASSIGNABLE_ROLES)[number]
														]
															.label()
															.toLowerCase(),
													}),
												)
											}
										/>
									) : (
										<RoleBadge role={member.role} />
									)}
									{editable ? (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={m.members_remove({ name: member.user.name })}
											onClick={() => {
												if (
													!window.confirm(
														m.members_remove_confirm({
															name: member.user.name,
														}),
													)
												)
													return;
												void run(
													() =>
														authClient.organization.removeMember({
															memberIdOrEmail: member.id,
														}),
													m.members_removed({ name: member.user.name }),
												);
											}}
										>
											<Trash2 />
										</Button>
									) : null}
								</li>
							);
						})}
					</ul>

					{pending.length ? (
						<div className="space-y-2">
							<h2 className="font-semibold">{m.members_pending()}</h2>
							<ul
								className="divide-y rounded-lg border bg-background"
								aria-label={m.members_pending()}
							>
								{pending.map((i) => (
									<li
										key={i.id}
										className="flex flex-wrap items-center gap-3 p-4"
									>
										<MailPlus
											className="size-5 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium">{i.email}</p>
											<p className="text-xs text-muted-foreground">
												{m.members_expires({
													date: new Date(i.expiresAt).toLocaleString(
														getLocale(),
													),
												})}
											</p>
										</div>
										<RoleBadge role={i.role ?? "viewer"} />
										{access.can.invite ? (
											<Button
												type="button"
												variant="ghost"
												size="icon"
												aria-label={m.members_cancel_invitation({
													email: i.email,
												})}
												onClick={() =>
													run(
														() =>
															authClient.organization.cancelInvitation({
																invitationId: i.id,
															}),
														m.members_invitation_cancelled({ email: i.email }),
													)
												}
											>
												<X />
											</Button>
										) : null}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</>
			)}
		</div>
	);
}
