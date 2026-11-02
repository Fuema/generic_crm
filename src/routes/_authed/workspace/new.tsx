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
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { workspaceNameSchema } from "#/lib/schema";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/workspace/new")({
	component: NewWorkspacePage,
});

function slugify(value: string) {
	const base = value
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
	return `${base || "workspace"}-${crypto.randomUUID().slice(0, 6)}`;
}

function NewWorkspacePage() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { name: "" },
		onSubmit: async ({ value }) => {
			setError(null);
			const parsed = workspaceNameSchema.safeParse(value.name);
			if (!parsed.success) return;
			// The creator becomes owner, and the new workspace becomes the active one
			const { error } = await authClient.organization.create({
				name: parsed.data,
				slug: slugify(parsed.data),
			});
			if (error) {
				setError(authErrorMessage(error));
				return;
			}
			await router.invalidate();
			await router.navigate({ to: "/projects" });
		},
	});

	return (
		<div className="mx-auto max-w-xl p-6">
			<Card>
				<CardHeader>
					<CardTitle>{m.workspace_new_title()}</CardTitle>
					<CardDescription>{m.workspace_new_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						noValidate
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="space-y-4"
					>
						<FormAlert message={error} />
						<form.Field
							name="name"
							validators={{
								onBlur: ({ value }) =>
									workspaceNameSchema.safeParse(value).error?.issues[0]
										?.message,
								onSubmit: ({ value }) =>
									workspaceNameSchema.safeParse(value).error?.issues[0]
										?.message,
							}}
						>
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="new-workspace-name">{m.common_name()}</Label>
									<Input
										id="new-workspace-name"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder={m.workspace_new_placeholder()}
										maxLength={50}
										aria-invalid={fieldErrors(field.state.meta).length > 0}
										aria-describedby="new-workspace-name-error"
									/>
									<FieldError
										id="new-workspace-name-error"
										meta={field.state.meta}
									/>
								</div>
							)}
						</form.Field>
						<form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
							{([canSubmit, isSubmitting]) => (
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? m.workspace_creating() : m.workspace_create()}
								</Button>
							)}
						</form.Subscribe>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
