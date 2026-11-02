import { useForm } from "@tanstack/react-form";
import { createFileRoute, useRouter } from "@tanstack/react-router";
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
import { BillingSettings } from "#/components/Workspace/BillingSettings";
import { RoleBadge } from "#/components/Workspace/RoleBadge";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import type { WorkspaceAccess } from "#/lib/authz";
import { getBillingSettings } from "#/lib/billing";
import { workspaceNameSchema } from "#/lib/schema";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed layout guard; Better Auth re-checks every action server-side
export const Route = createFileRoute("/_authed/workspace/settings")({
	loader: () => getBillingSettings(),
	component: SettingsPage,
});

type Status = { ok: boolean; message: string } | null;

// After leaving or deleting, move to another workspace (or create one if none is left)
async function moveToAnotherWorkspace(
	router: ReturnType<typeof useRouter>,
	access: WorkspaceAccess,
) {
	const next = access.workspaces.find((w) => w.id !== access.organizationId);
	if (next) {
		await authClient.organization.setActive({ organizationId: next.id });
		await router.invalidate();
		await router.navigate({ to: "/projects" });
	} else {
		await router.navigate({ to: "/workspace/new" });
	}
}

function RenameForm({
	name,
	onDone,
}: {
	name: string;
	onDone: (s: Status) => void;
}) {
	const router = useRouter();
	const form = useForm({
		defaultValues: { name },
		validators: {
			onBlur: ({ value }) =>
				workspaceNameSchema.safeParse(value.name).error?.issues[0]?.message,
		},
		onSubmit: async ({ value }) => {
			const parsed = workspaceNameSchema.safeParse(value.name);
			if (!parsed.success) return;
			const { error } = await authClient.organization.update({
				data: { name: parsed.data },
			});
			onDone(
				error
					? { ok: false, message: authErrorMessage(error) }
					: { ok: true, message: m.workspace_renamed() },
			);
			if (!error) await router.invalidate();
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
			className="flex flex-col gap-3 sm:flex-row sm:items-start"
		>
			<form.Field
				name="name"
				validators={{
					onChange: ({ value }) =>
						workspaceNameSchema.safeParse(value).error?.issues[0]?.message,
				}}
			>
				{(field) => (
					<div className="flex-1 space-y-2">
						<Label htmlFor="workspace-name" className="sr-only">
							{m.workspace_name_label()}
						</Label>
						<Input
							id="workspace-name"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							maxLength={50}
							aria-invalid={fieldErrors(field.state.meta).length > 0}
							aria-describedby="workspace-name-error"
						/>
						<FieldError id="workspace-name-error" meta={field.state.meta} />
					</div>
				)}
			</form.Field>
			<form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
				{([canSubmit, isSubmitting]) => (
					<Button type="submit" disabled={!canSubmit || isSubmitting}>
						{isSubmitting ? m.common_saving() : m.workspace_rename()}
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}

function SettingsPage() {
	const router = useRouter();
	const { access } = Route.useRouteContext();
	const billing = Route.useLoaderData();
	const [status, setStatus] = useState<Status>(null);
	const [confirmName, setConfirmName] = useState("");
	const [pending, setPending] = useState(false);

	if (!access?.workspace) {
		return (
			<p className="p-6 text-sm text-muted-foreground">
				{m.common_not_in_workspace()}
			</p>
		);
	}
	const workspace = access.workspace;

	const leave = async () => {
		if (!window.confirm(m.workspace_leave_confirm({ name: workspace.name })))
			return;
		setPending(true);
		const { error } = await authClient.organization.leave({
			organizationId: workspace.id,
		});
		setPending(false);
		if (error)
			return setStatus({ ok: false, message: authErrorMessage(error) });
		await moveToAnotherWorkspace(router, access);
	};

	const remove = async () => {
		setPending(true);
		const { error } = await authClient.organization.delete({
			organizationId: workspace.id,
		});
		setPending(false);
		if (error)
			return setStatus({ ok: false, message: authErrorMessage(error) });
		await moveToAnotherWorkspace(router, access);
	};

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6">
			<div className="flex items-center gap-3">
				<h1 className="text-2xl font-bold">{workspace.name}</h1>
				<RoleBadge role={access.role} />
			</div>
			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			{access.can.updateWorkspace ? (
				<Card>
					<CardHeader>
						<CardTitle>{m.workspace_name_title()}</CardTitle>
						<CardDescription>{m.workspace_name_description()}</CardDescription>
					</CardHeader>
					<CardContent>
						<RenameForm name={workspace.name} onDone={setStatus} />
					</CardContent>
				</Card>
			) : null}

			<BillingSettings
				settings={billing}
				canEdit={access.can.updateWorkspace}
			/>

			<Card>
				<CardHeader>
					<CardTitle>{m.workspace_leave_title()}</CardTitle>
					<CardDescription>
						{access.role === "owner"
							? m.workspace_leave_owner_note()
							: m.workspace_leave_member_note()}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						type="button"
						variant="outline"
						onClick={leave}
						disabled={pending}
					>
						{m.workspace_leave({ name: workspace.name })}
					</Button>
				</CardContent>
			</Card>

			{access.can.deleteWorkspace ? (
				<Card className="border-destructive/50">
					<CardHeader>
						<CardTitle className="text-destructive">
							{m.workspace_delete_title()}
						</CardTitle>
						<CardDescription>
							{m.workspace_delete_description()}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<Label htmlFor="confirm-delete" className="font-normal">
							{m.workspace_delete_type_before()}{" "}
							<strong>{workspace.name}</strong>{" "}
							{m.workspace_delete_type_after()}
						</Label>
						<Input
							id="confirm-delete"
							value={confirmName}
							onChange={(e) => setConfirmName(e.target.value)}
							autoComplete="off"
						/>
						<Button
							type="button"
							variant="destructive"
							disabled={confirmName !== workspace.name || pending}
							onClick={remove}
						>
							{pending ? m.workspace_deleting() : m.workspace_delete()}
						</Button>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
