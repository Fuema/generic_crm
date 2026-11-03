import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Lock, Pencil, Plus } from "lucide-react";
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
import { serverErrorMessage } from "#/components/data/serverError";
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
import {
	ContactFormDialog,
	EMPTY_CONTACT,
} from "#/modules/contacts/components/ContactFormDialog";
import { StageBadge } from "#/modules/contacts/components/StageBadge";
import {
	archiveContact,
	type ContactListRow,
	createContact,
	getContactFormOptions,
	listContacts,
	restoreContact,
} from "#/modules/contacts/contacts";
import {
	CONSENT_LABELS,
	type ContactSearch,
	contactName,
	contactSearchSchema,
	EMAIL_CONSENTS,
	type EmailConsent,
	LIFECYCLE_STAGES,
	STAGE_LABELS,
} from "#/modules/contacts/schema";
import { CsvActions } from "#/modules/csv/components/CsvActions";
import { getRecordFields } from "#/modules/fields/fields";
import { formatValue } from "#/modules/fields/values";
import { TagPill } from "#/modules/records/components/TagEditor";
import { listWorkspaceTags } from "#/modules/records/records";
import {
	columnLabel,
	ViewToolbar,
} from "#/modules/views/components/ViewToolbar";
import { BUILT_IN_SORT, DEFAULT_COLUMNS } from "#/modules/views/schema";
import { listViews } from "#/modules/views/views";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed guard; listContacts requires contact:read. The list
// state (page, size, search, filters, columns, sort, view) lives in the URL.
export const Route = createFileRoute("/_authed/contacts/")({
	validateSearch: contactSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [list, options, allTags, fields, views] = await Promise.all([
			listContacts({ data: deps }),
			getContactFormOptions(),
			listWorkspaceTags(),
			getRecordFields({ data: { objectKey: "contact" } }),
			listViews({ data: { objectKey: "contact" } }),
		]);
		return { ...list, options, allTags, fields, views };
	},
	component: ContactsPage,
});

function ContactsPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { rows, total, pageCount, options, allTags, fields, views } =
		Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const can = {
		create: roleCan(access?.role, { contact: ["create"] }),
		update: roleCan(access?.role, { contact: ["update"] }),
		archive: roleCan(access?.role, { contact: ["delete"] }),
	};
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const columns = search.columns ?? DEFAULT_COLUMNS.contact;
	const sortable = new Set([
		...BUILT_IN_SORT.contact,
		...fields.fields.map((f) => `custom.${f.key}`),
	]);

	const patch = useCallback(
		(p: Partial<ContactSearch>) => {
			void navigate({ search: (prev) => ({ ...prev, ...p }) });
		},
		[navigate],
	);

	// After archiving the last row of the last page, step back to a page that exists
	useEffect(() => {
		if (total > 0 && search.page > pageCount) patch({ page: pageCount });
	}, [total, pageCount, search.page, patch]);

	const toggleArchived = async (row: ContactListRow) => {
		const name = contactName(row);
		const archived = Boolean(row.archivedAt);
		if (!archived && !window.confirm(m.contacts_archive_confirm({ name })))
			return;
		setStatus(null);
		try {
			await (archived ? restoreContact : archiveContact)({
				data: { id: row.id },
			});
			setStatus({
				ok: true,
				message: archived
					? m.contacts_restored({ name })
					: m.contacts_archived({ name }),
			});
			await router.invalidate();
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	const header = (column: string, label: string) =>
		sortable.has(column) ? (
			<TableHead key={column} aria-sort={ariaSort(search, column)}>
				<SortButton
					column={column}
					state={search}
					onSort={(p) => patch(p as Partial<ContactSearch>)}
				>
					{label}
				</SortButton>
			</TableHead>
		) : (
			<TableHead key={column}>{label}</TableHead>
		);

	// One cell per chosen column; custom fields use their definition's formatting
	const cell = (row: ContactListRow, column: string): ReactNode => {
		switch (column) {
			case "email":
				return row.email ? (
					<a href={`mailto:${row.email}`} className="hover:underline">
						{row.email}
					</a>
				) : (
					m.common_none()
				);
			case "phone":
				return row.phone ?? m.common_none();
			case "jobTitle":
				return row.jobTitle ?? m.common_none();
			case "companyId":
				return row.companyId && row.companyName ? (
					<Link
						to="/companies/$companyId"
						params={{ companyId: row.companyId }}
						className="hover:underline"
					>
						{row.companyName}
					</Link>
				) : (
					m.common_none()
				);
			case "lifecycleStage":
				return <StageBadge stage={row.lifecycleStage} />;
			case "tags":
				return (
					<div className="flex max-w-48 flex-wrap gap-1">
						{row.tags.slice(0, 3).map((t) => (
							<TagPill key={t.id} tag={t} />
						))}
						{row.tags.length > 3 ? (
							<span className="text-xs text-muted-foreground">
								+{row.tags.length - 3}
							</span>
						) : null}
					</div>
				);
			case "ownerId":
				return row.ownerName ?? m.common_none();
			case "emailConsent":
				return CONSENT_LABELS[row.emailConsent as EmailConsent]?.() ?? "";
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
					<h1 className="text-2xl font-bold">{m.contacts_title()}</h1>
					<p className="text-sm text-muted-foreground">
						{m.contacts_subtitle({
							workspace: access?.workspace?.name ?? m.members_this_workspace(),
						})}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<CsvActions
						objectKey="contact"
						search={search}
						defs={fields.fields}
						canImport={can.create}
						canUpdate={can.update}
						onImported={() => router.invalidate()}
						onStatus={setStatus}
					/>
					{can.create ? (
						<Button type="button" onClick={() => setOpen(true)}>
							<Plus /> {m.contacts_new()}
						</Button>
					) : (
						<p className="flex items-center gap-2 text-sm text-muted-foreground">
							<Lock className="size-4" aria-hidden="true" />{" "}
							{m.common_view_only()}
						</p>
					)}
				</div>
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			<ViewToolbar
				objectKey="contact"
				state={search}
				views={views}
				defs={fields.fields}
				choices={{
					lifecycleStage: LIFECYCLE_STAGES.map((s) => ({
						value: s,
						label: STAGE_LABELS[s](),
					})),
					emailConsent: EMAIL_CONSENTS.map((c) => ({
						value: c,
						label: CONSENT_LABELS[c](),
					})),
					ownerId: options.members.map((u) => ({ value: u.id, label: u.name })),
					companyId: options.companies.map((c) => ({
						value: c.id,
						label: c.name,
					})),
					tag: allTags.map((t) => ({ value: t.id, label: t.name })),
				}}
				onChange={(p) => patch(p as Partial<ContactSearch>)}
				onViewsChanged={() => router.invalidate()}
				onStatus={setStatus}
			/>

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="contact-search"
					value={search.q}
					placeholder={m.contacts_search_placeholder()}
					onSearch={(q) => patch({ q, page: 1 })}
				/>
				<FilterSelect
					id="contact-stage-filter"
					label={m.contacts_filter_stage()}
					value={search.status}
					allLabel={m.contacts_all_stages()}
					options={LIFECYCLE_STAGES.map((s) => ({
						value: s,
						label: STAGE_LABELS[s](),
					}))}
					onChange={(v) =>
						patch({ status: v as ContactSearch["status"], page: 1 })
					}
				/>
				<FilterSelect
					id="contact-tag-filter"
					label={m.tags_filter()}
					value={search.tag}
					allLabel={m.tags_all()}
					options={allTags.map((t) => ({ value: t.id, label: t.name }))}
					onChange={(v) => patch({ tag: v, page: 1 } as Partial<ContactSearch>)}
				/>
				<FilterSelect
					id="contact-show-filter"
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
							{header("name", m.contacts_col_name())}
							{columns.map((c) => header(c, columnLabel(c, fields.fields)))}
							<TableHead>
								<span className="sr-only">{m.list_actions()}</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length ? (
							rows.map((row) => {
								const name = contactName(row);
								return (
									<TableRow key={row.id}>
										<TableCell>
											<Link
												to="/contacts/$contactId"
												params={{ contactId: row.id }}
												className="font-medium hover:underline"
											>
												{name}
											</Link>
										</TableCell>
										{columns.map((c) => (
											<TableCell key={c}>{cell(row, c)}</TableCell>
										))}
										<TableCell>
											<div className="flex justify-end gap-1">
												{!row.archivedAt ? (
													<Link
														to="/contacts/$contactId"
														params={{ contactId: row.id }}
														aria-label={m.contacts_edit_label({ name })}
														className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
													>
														<Pencil className="size-4" />
													</Link>
												) : null}
												{can.archive ? (
													<Button
														type="button"
														variant="ghost"
														size="icon"
														aria-label={
															row.archivedAt
																? m.common_restore()
																: m.contacts_archive_label({ name })
														}
														onClick={() => toggleArchived(row)}
													>
														{row.archivedAt ? <ArchiveRestore /> : <Archive />}
													</Button>
												) : null}
											</div>
										</TableCell>
									</TableRow>
								);
							})
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length + 2}
									className="h-24 text-center text-muted-foreground"
								>
									{m.contacts_empty()}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<ListPagination
				label={m.contacts_pages()}
				total={total}
				pageCount={pageCount}
				state={search}
				onChange={(p) => patch(p as Partial<ContactSearch>)}
			/>

			<ContactFormDialog
				open={open}
				onOpenChange={setOpen}
				initial={EMPTY_CONTACT}
				editing={false}
				fields={fields}
				initialCustom={{}}
				options={options}
				onSave={async (value) => {
					const { id } = await createContact({ data: value });
					setOpen(false);
					setStatus({
						ok: true,
						message: m.contacts_added({ name: contactName(value) }),
					});
					await router.invalidate();
					void navigate({
						to: "/contacts/$contactId",
						params: { contactId: id },
					});
				}}
			/>
		</div>
	);
}
