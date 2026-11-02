import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Lock, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { countryName } from "#/lib/countries";
import { roleCan } from "#/lib/permissions";
import {
	CompanyFormDialog,
	EMPTY_COMPANY,
} from "#/modules/contacts/components/CompanyFormDialog";
import {
	archiveCompany,
	type CompanyListRow,
	createCompany,
	getContactFormOptions,
	listCompanies,
	restoreCompany,
} from "#/modules/contacts/contacts";
import {
	type CompanySearch,
	companySearchSchema,
} from "#/modules/contacts/schema";
import { getRecordFields } from "#/modules/fields/fields";
import { TagPill } from "#/modules/records/components/TagEditor";
import { listWorkspaceTags } from "#/modules/records/records";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed guard; listCompanies requires company:read
export const Route = createFileRoute("/_authed/companies/")({
	validateSearch: companySearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [list, options, allTags, fields] = await Promise.all([
			listCompanies({ data: deps }),
			getContactFormOptions(),
			listWorkspaceTags(),
			getRecordFields({ data: { objectKey: "company" } }),
		]);
		return { ...list, members: options.members, allTags, fields };
	},
	component: CompaniesPage,
});

function CompaniesPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { rows, total, pageCount, members, allTags, fields } =
		Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const can = {
		create: roleCan(access?.role, { company: ["create"] }),
		archive: roleCan(access?.role, { company: ["delete"] }),
	};
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);

	const patch = useCallback(
		(p: Partial<CompanySearch>) => {
			void navigate({ search: (prev) => ({ ...prev, ...p }) });
		},
		[navigate],
	);

	useEffect(() => {
		if (total > 0 && search.page > pageCount) patch({ page: pageCount });
	}, [total, pageCount, search.page, patch]);

	const toggleArchived = async (row: CompanyListRow) => {
		const name = row.name;
		const archived = Boolean(row.archivedAt);
		if (!archived && !window.confirm(m.companies_archive_confirm({ name })))
			return;
		setStatus(null);
		try {
			await (archived ? restoreCompany : archiveCompany)({
				data: { id: row.id },
			});
			setStatus({
				ok: true,
				message: archived
					? m.companies_restored({ name })
					: m.companies_archived({ name }),
			});
			await router.invalidate();
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	const sortHeader = (column: CompanySearch["sort"], label: string) => (
		<TableHead aria-sort={ariaSort(search, column)}>
			<SortButton
				column={column}
				state={search}
				onSort={(p) => patch(p as Partial<CompanySearch>)}
			>
				{label}
			</SortButton>
		</TableHead>
	);

	return (
		<div className="mx-auto max-w-7xl space-y-6 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">{m.companies_title()}</h1>
					<p className="text-sm text-muted-foreground">
						{m.companies_subtitle({
							workspace: access?.workspace?.name ?? m.members_this_workspace(),
						})}
					</p>
				</div>
				{can.create ? (
					<Button type="button" onClick={() => setOpen(true)}>
						<Plus /> {m.companies_new()}
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

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="company-search"
					value={search.q}
					placeholder={m.companies_search_placeholder()}
					onSearch={(q) => patch({ q, page: 1 })}
				/>
				<FilterSelect
					id="company-tag-filter"
					label={m.tags_filter()}
					value={search.tag}
					allLabel={m.tags_all()}
					options={allTags.map((t) => ({ value: t.id, label: t.name }))}
					onChange={(v) => patch({ tag: v, page: 1 } as Partial<CompanySearch>)}
				/>
				<FilterSelect
					id="company-show-filter"
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
							{sortHeader("name", m.companies_col_name())}
							{sortHeader("domain", m.companies_col_domain())}
							<TableHead className="text-right">
								{m.companies_col_contacts()}
							</TableHead>
							<TableHead>{m.contacts_col_tags()}</TableHead>
							<TableHead>{m.companies_col_location()}</TableHead>
							<TableHead>{m.common_owner()}</TableHead>
							{sortHeader("createdAt", m.contacts_col_added())}
							<TableHead>
								<span className="sr-only">{m.list_actions()}</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length ? (
							rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<Link
											to="/companies/$companyId"
											params={{ companyId: row.id }}
											className="font-medium hover:underline"
										>
											{row.name}
										</Link>
									</TableCell>
									<TableCell>{row.domain ?? m.common_none()}</TableCell>
									<TableCell className="text-right tabular-nums">
										{row.contactCount}
									</TableCell>
									<TableCell>
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
									</TableCell>
									<TableCell>
										{[row.city, countryName(row.country)]
											.filter(Boolean)
											.join(", ") || m.common_none()}
									</TableCell>
									<TableCell>{row.ownerName ?? m.common_none()}</TableCell>
									<TableCell>{formatDate(row.createdAt)}</TableCell>
									<TableCell>
										<div className="flex justify-end gap-1">
											{can.archive ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={
														row.archivedAt
															? m.common_restore()
															: m.contacts_archive_label({ name: row.name })
													}
													onClick={() => toggleArchived(row)}
												>
													{row.archivedAt ? <ArchiveRestore /> : <Archive />}
												</Button>
											) : null}
										</div>
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={8}
									className="h-24 text-center text-muted-foreground"
								>
									{m.companies_empty()}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<ListPagination
				label={m.companies_pages()}
				total={total}
				pageCount={pageCount}
				state={search}
				onChange={(p) => patch(p as Partial<CompanySearch>)}
			/>

			<CompanyFormDialog
				open={open}
				onOpenChange={setOpen}
				initial={EMPTY_COMPANY}
				editing={false}
				fields={fields}
				initialCustom={{}}
				members={members}
				onSave={async (value) => {
					const { id } = await createCompany({ data: value });
					setOpen(false);
					setStatus({
						ok: true,
						message: m.companies_added({ name: value.name }),
					});
					await router.invalidate();
					void navigate({
						to: "/companies/$companyId",
						params: { companyId: id },
					});
				}}
			/>
		</div>
	);
}
