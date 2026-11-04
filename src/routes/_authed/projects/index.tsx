import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Lock, Plus } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import {
	ariaSort,
	FilterSelect,
	formatDate,
	ListPagination,
	SearchBox,
	SortButton,
} from "#/components/data/ListControls";
import { Button } from "#/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { roleCan } from "#/lib/permissions";
import { getContactFormOptions } from "#/modules/contacts/contacts";
import { formatDay } from "#/modules/deals/components/DealBits";
import { DocumentStatusBadge } from "#/modules/documents/components/DocumentBits";
import { getRecordFields } from "#/modules/fields/fields";
import { formatValue } from "#/modules/fields/values";
import { projectStatus } from "#/modules/projects/components/ProjectBits";
import {
	EMPTY_PROJECT,
	ProjectFormDialog,
} from "#/modules/projects/components/ProjectFormDialog";
import {
	createProject,
	listProjects,
	type ProjectRow,
} from "#/modules/projects/projects";
import {
	PROJECT_STATUS_LABELS,
	PROJECT_STATUSES,
	type ProjectSearch,
	type ProjectStatus,
	projectSearchSchema,
} from "#/modules/projects/schema";
import { listWorkspaceTags } from "#/modules/records/records";
import {
	columnLabel,
	ViewToolbar,
} from "#/modules/views/components/ViewToolbar";
import { BUILT_IN_SORT, DEFAULT_COLUMNS } from "#/modules/views/schema";
import { listViews } from "#/modules/views/views";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed guard; listProjects requires project:read
export const Route = createFileRoute("/_authed/projects/")({
	validateSearch: projectSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [list, options, allTags, fields, views] = await Promise.all([
			listProjects({ data: deps }),
			getContactFormOptions(),
			listWorkspaceTags(),
			getRecordFields({ data: { objectKey: "project" } }),
			listViews({ data: { objectKey: "project" } }),
		]);
		return { ...list, options, allTags, fields, views };
	},
	component: ProjectsPage,
});

function ProjectsPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { rows, total, pageCount, options, allTags, fields, views } =
		Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const canCreate = roleCan(access?.role, { project: ["create"] });
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const [open, setOpen] = useState(false);
	const columns = search.columns ?? DEFAULT_COLUMNS.project;
	const sortable = new Set([
		...BUILT_IN_SORT.project,
		...fields.fields.map((f) => `custom.${f.key}`),
	]);

	const patch = useCallback(
		(p: Partial<ProjectSearch>) => {
			void navigate({ search: (prev) => ({ ...prev, ...p }) });
		},
		[navigate],
	);
	useEffect(() => {
		if (total > 0 && search.page > pageCount) patch({ page: pageCount });
	}, [total, pageCount, search.page, patch]);

	const header = (column: string, label: string) =>
		sortable.has(column) ? (
			<TableHead key={column} aria-sort={ariaSort(search, column)}>
				<SortButton
					column={column}
					state={search}
					onSort={(p) => patch(p as Partial<ProjectSearch>)}
				>
					{label}
				</SortButton>
			</TableHead>
		) : (
			<TableHead key={column}>{label}</TableHead>
		);

	const cell = (row: ProjectRow, column: string): ReactNode => {
		switch (column) {
			case "status":
				return <DocumentStatusBadge {...projectStatus(row.status)} />;
			case "contactId":
				return row.contactId && row.contactName ? (
					<Link
						to="/contacts/$contactId"
						params={{ contactId: row.contactId }}
						className="hover:underline"
					>
						{row.contactName}
					</Link>
				) : (
					m.common_none()
				);
			case "companyId":
				return row.companyName ?? m.common_none();
			case "dealId":
				return row.dealId && row.dealName ? (
					<Link
						to="/deals/$dealId"
						params={{ dealId: row.dealId }}
						className="hover:underline"
					>
						{row.dealName}
					</Link>
				) : (
					m.common_none()
				);
			case "startDate":
				return formatDay(row.startDate);
			case "dueDate":
				return formatDay(row.dueDate);
			case "ownerId":
				return row.ownerName ?? m.common_none();
			case "createdAt":
				return formatDate(row.createdAt);
			default: {
				const def = fields.fields.find((f) => `custom.${f.key}` === column);
				if (!def) return m.common_none();
				const value = Object.hasOwn(row.custom, def.key)
					? row.custom[def.key]
					: undefined;
				return formatValue(def, value, fields.currency) || m.common_none();
			}
		}
	};

	return (
		<div className="mx-auto max-w-7xl space-y-6 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">{m.projects_title()}</h1>
					<p className="text-sm text-muted-foreground">
						{m.projects_summary({ count: total })}
					</p>
				</div>
				{canCreate ? (
					<Button type="button" onClick={() => setOpen(true)}>
						<Plus /> {m.projects_new()}
					</Button>
				) : (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Lock className="size-4" aria-hidden="true" />{" "}
						{m.common_view_only()}
					</p>
				)}
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			<ViewToolbar
				objectKey="project"
				state={search}
				views={views}
				defs={fields.fields}
				choices={{
					status: PROJECT_STATUSES.map((s) => ({
						value: s,
						label: PROJECT_STATUS_LABELS[s](),
					})),
					companyId: options.companies.map((c) => ({
						value: c.id,
						label: c.name,
					})),
					ownerId: options.members.map((u) => ({ value: u.id, label: u.name })),
					tag: allTags.map((t) => ({ value: t.id, label: t.name })),
				}}
				onChange={(p) => patch(p as Partial<ProjectSearch>)}
				onViewsChanged={() => router.invalidate()}
				onStatus={setStatus}
			/>

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="project-search"
					value={search.q}
					placeholder={m.projects_search_placeholder()}
					onSearch={(q) => patch({ q, page: 1 })}
				/>
				<FilterSelect
					id="project-status-filter"
					label={m.quote_status()}
					value={search.status}
					allLabel={m.deals_all_statuses()}
					options={PROJECT_STATUSES.map((s) => ({
						value: s,
						label: PROJECT_STATUS_LABELS[s](),
					}))}
					onChange={(v) =>
						patch({ status: v as ProjectStatus | undefined, page: 1 })
					}
				/>
				<FilterSelect
					id="project-show-filter"
					label={m.common_show()}
					value={search.show === "archived" ? "archived" : undefined}
					allLabel={m.common_show_active()}
					options={[{ value: "archived", label: m.common_show_archived() }]}
					onChange={(v) =>
						patch({ show: v === "archived" ? "archived" : "active", page: 1 })
					}
				/>
			</div>

			<div className="overflow-x-auto rounded-lg border bg-background">
				<Table>
					<TableHeader>
						<TableRow>
							{header("name", m.project_name())}
							{columns.map((c) => header(c, columnLabel(c, fields.fields)))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length ? (
							rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<Link
											to="/projects/$projectId"
											params={{ projectId: row.id }}
											className="font-medium hover:underline"
										>
											{row.name}
										</Link>
									</TableCell>
									{columns.map((c) => (
										<TableCell key={c}>{cell(row, c)}</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length + 1}
									className="h-24 text-center text-muted-foreground"
								>
									{m.projects_empty()}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<ListPagination
				label={m.projects_pages()}
				total={total}
				pageCount={pageCount}
				state={search}
				onChange={(p) => patch(p as Partial<ProjectSearch>)}
			/>

			{open ? (
				<ProjectFormDialog
					open
					onOpenChange={setOpen}
					initial={EMPTY_PROJECT}
					initialContact={null}
					initialCustom={{}}
					editing={false}
					fields={fields}
					options={options}
					onSave={async (value) => {
						const { id } = await createProject({ data: value });
						setOpen(false);
						void navigate({
							to: "/projects/$projectId",
							params: { projectId: id },
						});
					}}
				/>
			) : null}
		</div>
	);
}
