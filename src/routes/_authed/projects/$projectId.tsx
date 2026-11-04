import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { Archive, ArchiveRestore, ArrowLeft, Pencil } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { formatDate } from "#/components/data/ListControls";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { roleCan } from "#/lib/permissions";
import { getContactFormOptions } from "#/modules/contacts/contacts";
import { formatDay } from "#/modules/deals/components/DealBits";
import { storedToDay } from "#/modules/deals/schema";
import { DocumentStatusBadge } from "#/modules/documents/components/DocumentBits";
import {
	CustomFieldsView,
	customFieldLabels,
} from "#/modules/fields/components/CustomFields";
import { getRecordFields } from "#/modules/fields/fields";
import { projectStatus } from "#/modules/projects/components/ProjectBits";
import { ProjectFormDialog } from "#/modules/projects/components/ProjectFormDialog";
import {
	archiveProject,
	getProject,
	restoreProject,
	updateProject,
} from "#/modules/projects/projects";
import type { ProjectStatus } from "#/modules/projects/schema";
import { RecordTimeline } from "#/modules/records/components/RecordTimeline";
import { TagEditor } from "#/modules/records/components/TagEditor";
import { getTimeline, listWorkspaceTags } from "#/modules/records/records";
import { RecordWork } from "#/modules/tasks/components/RecordWork";
import { listRecordWork } from "#/modules/tasks/tasks";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/projects/$projectId")({
	loader: async ({ params }) => {
		try {
			const subject = {
				subjectType: "project" as const,
				subjectId: params.projectId,
			};
			const [detail, options, timeline, allTags, fields, work] =
				await Promise.all([
					getProject({ data: { id: params.projectId } }),
					getContactFormOptions(),
					getTimeline({ data: subject }),
					listWorkspaceTags(),
					getRecordFields({ data: { objectKey: "project" } }),
					listRecordWork({ data: subject }),
				]);
			return { work, ...detail, options, timeline, allTags, fields };
		} catch (e) {
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	component: ProjectPage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_project_not_found()}
		</p>
	),
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div>
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="text-sm">{value || m.common_none()}</dd>
		</div>
	);
}

function ProjectPage() {
	const router = useRouter();
	const data = Route.useLoaderData();
	const { work } = Route.useLoaderData();
	const { project: p, options, timeline, allTags, fields } = data;
	const { access, session } = Route.useRouteContext();
	const can = {
		update: roleCan(access?.role, { project: ["update"] }),
		archive: roleCan(access?.role, { project: ["delete"] }),
	};
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const archived = Boolean(p.archivedAt);

	const toggleArchived = async () => {
		setStatus(null);
		try {
			await (archived ? restoreProject : archiveProject)({
				data: { id: p.id },
			});
			setStatus({
				ok: true,
				message: archived
					? m.deals_restored({ name: p.name })
					: m.deals_archived({ name: p.name }),
			});
			await router.invalidate();
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6">
			<Link
				to="/projects"
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
			>
				<ArrowLeft className="size-4" /> {m.project_back()}
			</Link>

			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-2xl font-bold">{p.name}</h1>
					<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<DocumentStatusBadge {...projectStatus(p.status)} />
						{p.contactId && data.contactName ? (
							<Link
								to="/contacts/$contactId"
								params={{ contactId: p.contactId }}
								className="hover:underline"
							>
								{data.contactName}
							</Link>
						) : null}
						{p.dealId && data.dealName ? (
							<Link
								to="/deals/$dealId"
								params={{ dealId: p.dealId }}
								className="hover:underline"
							>
								{data.dealName}
							</Link>
						) : null}
					</div>
				</div>
				<div className="flex gap-2">
					{can.update && !archived ? (
						<Button type="button" onClick={() => setOpen(true)}>
							<Pencil /> {m.common_edit()}
						</Button>
					) : null}
					{can.archive ? (
						<Button type="button" variant="outline" onClick={toggleArchived}>
							{archived ? <ArchiveRestore /> : <Archive />}
							{archived ? m.common_restore() : m.common_archive()}
						</Button>
					) : null}
				</div>
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>
			{archived ? <FormAlert message={m.common_archived_banner()} /> : null}

			<div className="grid gap-6 lg:grid-cols-3">
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle>{m.project_details()}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="mb-4 space-y-1.5">
							<p className="text-xs text-muted-foreground">{m.tags_label()}</p>
							<TagEditor
								subjectType="project"
								subjectId={p.id}
								tags={timeline.tags}
								allTags={allTags}
								canEdit={can.update && !archived}
								onChanged={() => router.invalidate()}
							/>
						</div>
						<dl className="space-y-3">
							<Field
								label={m.project_start()}
								value={p.startDate ? formatDay(p.startDate) : null}
							/>
							<Field
								label={m.project_due()}
								value={p.dueDate ? formatDay(p.dueDate) : null}
							/>
							<Field label={m.common_owner()} value={data.ownerName} />
							<Field label={m.contact_company()} value={data.companyName} />
							<Field
								label={m.contacts_col_added()}
								value={formatDate(p.createdAt)}
							/>
						</dl>
						{p.description ? (
							<p className="mt-4 whitespace-pre-wrap text-sm">
								{p.description}
							</p>
						) : null}
						<div className="mt-4">
							<CustomFieldsView fields={fields} custom={p.custom} />
						</div>
					</CardContent>
				</Card>
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>{m.timeline_title()}</CardTitle>
					</CardHeader>
					<RecordWork
						subjectType="project"
						subjectId={p.id}
						label={p.name}
						work={work}
						role={access?.role}
						archived={archived}
					/>
					<CardContent>
						<RecordTimeline
							subjectType="project"
							subjectId={p.id}
							timeline={timeline}
							canWrite={can.update && !archived}
							canDeleteAny={can.archive}
							currentUserId={session.user.id}
							fieldLabels={customFieldLabels(fields)}
							onChanged={() => router.invalidate()}
						/>
					</CardContent>
				</Card>
			</div>

			{open ? (
				<ProjectFormDialog
					open
					onOpenChange={setOpen}
					initial={{
						name: p.name,
						description: p.description ?? "",
						status: p.status as ProjectStatus,
						startDate: storedToDay(p.startDate),
						dueDate: storedToDay(p.dueDate),
						ownerId: p.ownerId ?? "",
						contactId: p.contactId ?? "",
						companyId: p.companyId ?? "",
					}}
					initialContact={
						p.contactId
							? {
									id: p.contactId,
									firstName: data.contactName ?? "",
									lastName: null,
								}
							: null
					}
					initialCustom={p.custom}
					editing
					fields={fields}
					options={options}
					onSave={async (value) => {
						await updateProject({ data: { id: p.id, ...value } });
						setOpen(false);
						setStatus({
							ok: true,
							message: m.deals_updated({ name: value.name }),
						});
						await router.invalidate();
					}}
				/>
			) : null}
		</div>
	);
}
