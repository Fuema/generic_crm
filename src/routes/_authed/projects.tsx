import { useForm } from "@tanstack/react-form";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { FolderKanban, Lock, Pencil, Trash2 } from "lucide-react";
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
import { Textarea } from "#/components/ui/textarea";
import {
	createProject,
	deleteProject,
	listProjects,
	updateProject,
} from "#/lib/projects";
import { projectInputSchema } from "#/lib/schema";

// Protected by the _authed layout guard; listProjects itself requires project:read
export const Route = createFileRoute("/_authed/projects")({
	loader: () => listProjects(),
	component: ProjectsPage,
});

type Project = Awaited<ReturnType<typeof listProjects>>[number];

function errorMessage(error: unknown) {
	if (error instanceof Response) {
		return error.status === 403
			? "Your role in this workspace doesn't allow that."
			: `Request failed (${error.status}).`;
	}
	return error instanceof Error
		? error.message
		: "Something went wrong. Please try again.";
}

function ProjectForm({
	initial,
	submitLabel,
	onSubmit,
	onCancel,
}: {
	initial: { name: string; description: string };
	submitLabel: string;
	onSubmit: (value: { name: string; description: string }) => Promise<void>;
	onCancel?: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: initial,
		validators: { onBlur: projectInputSchema, onSubmit: projectInputSchema },
		onSubmit: async ({ value, formApi }) => {
			setError(null);
			try {
				await onSubmit(value);
				if (!onCancel) formApi.reset();
			} catch (e) {
				setError(errorMessage(e));
			}
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
			<form.Field name="name">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor={`${field.name}-${submitLabel}`}>Name</Label>
						<Input
							id={`${field.name}-${submitLabel}`}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							maxLength={80}
							aria-invalid={fieldErrors(field.state.meta).length > 0}
						/>
						<FieldError
							id={`${field.name}-${submitLabel}-error`}
							meta={field.state.meta}
						/>
					</div>
				)}
			</form.Field>
			<form.Field name="description">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor={`${field.name}-${submitLabel}`}>
							Description (optional)
						</Label>
						<Textarea
							id={`${field.name}-${submitLabel}`}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							maxLength={500}
							rows={2}
						/>
						<FieldError
							id={`${field.name}-${submitLabel}-error`}
							meta={field.state.meta}
						/>
					</div>
				)}
			</form.Field>
			<div className="flex gap-2">
				<form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
					{([canSubmit, isSubmitting]) => (
						<Button type="submit" disabled={!canSubmit || isSubmitting}>
							{isSubmitting ? "Saving..." : submitLabel}
						</Button>
					)}
				</form.Subscribe>
				{onCancel ? (
					<Button type="button" variant="ghost" onClick={onCancel}>
						Cancel
					</Button>
				) : null}
			</div>
		</form>
	);
}

function ProjectRow({
	project,
	canUpdate,
	canDelete,
}: {
	project: Project;
	canUpdate: boolean;
	canDelete: boolean;
}) {
	const router = useRouter();
	const [editing, setEditing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const remove = async () => {
		if (!window.confirm(`Delete "${project.name}"? This can't be undone.`))
			return;
		try {
			await deleteProject({ data: { id: project.id } });
			await router.invalidate();
		} catch (e) {
			setError(errorMessage(e));
		}
	};

	if (editing) {
		return (
			<li className="p-4">
				<ProjectForm
					initial={{
						name: project.name,
						description: project.description ?? "",
					}}
					submitLabel="Save"
					onSubmit={async (value) => {
						await updateProject({ data: { id: project.id, ...value } });
						setEditing(false);
						await router.invalidate();
					}}
					onCancel={() => setEditing(false)}
				/>
			</li>
		);
	}

	return (
		<li className="flex items-start gap-3 p-4">
			<FolderKanban
				className="mt-0.5 size-5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
			<div className="min-w-0 flex-1 space-y-1">
				<p className="font-medium break-words">{project.name}</p>
				{project.description ? (
					<p className="text-sm text-muted-foreground break-words">
						{project.description}
					</p>
				) : null}
				<p className="text-xs text-muted-foreground">
					Updated {new Date(project.updatedAt).toLocaleString()}
				</p>
				<FormAlert message={error} />
			</div>
			{canUpdate ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={() => setEditing(true)}
					aria-label={`Edit ${project.name}`}
				>
					<Pencil />
				</Button>
			) : null}
			{canDelete ? (
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={remove}
					aria-label={`Delete ${project.name}`}
				>
					<Trash2 />
				</Button>
			) : null}
		</li>
	);
}

function ProjectsPage() {
	const router = useRouter();
	const projects = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const can = access?.can;

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6">
			<div>
				<h1 className="text-2xl font-bold">Projects</h1>
				<p className="text-sm text-muted-foreground">
					Projects in {access?.workspace?.name ?? "this workspace"}.
				</p>
			</div>

			{can?.createProject ? (
				<Card>
					<CardHeader>
						<CardTitle>New project</CardTitle>
						<CardDescription>
							Everyone in the workspace can see it.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ProjectForm
							initial={{ name: "", description: "" }}
							submitLabel="Create project"
							onSubmit={async (value) => {
								await createProject({ data: value });
								await router.invalidate();
							}}
						/>
					</CardContent>
				</Card>
			) : (
				<p className="flex items-center gap-2 rounded-lg border bg-background p-3 text-sm text-muted-foreground">
					<Lock className="size-4" aria-hidden="true" />
					You have view-only access here. Ask an admin for the editor role to
					create projects.
				</p>
			)}

			{projects.length ? (
				<ul className="divide-y rounded-lg border bg-background">
					{projects.map((p) => (
						<ProjectRow
							key={p.id}
							project={p}
							canUpdate={Boolean(can?.updateProject)}
							canDelete={Boolean(can?.deleteProject)}
						/>
					))}
				</ul>
			) : (
				<p className="rounded-lg border border-dashed bg-background p-8 text-center text-sm text-muted-foreground">
					No projects yet.
				</p>
			)}
		</div>
	);
}
