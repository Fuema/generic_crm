import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
	Archive,
	ArchiveRestore,
	KanbanSquare,
	List,
	Lock,
	Plus,
} from "lucide-react";
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
import { formatMoney } from "#/lib/money";
import { roleCan } from "#/lib/permissions";
import { getContactFormOptions } from "#/modules/contacts/contacts";
import { formatDay, StatusBadge } from "#/modules/deals/components/DealBits";
import {
	DealFormDialog,
	emptyDeal,
} from "#/modules/deals/components/DealFormDialog";
import { StageMover } from "#/modules/deals/components/StageMover";
import {
	archiveDeal,
	createDeal,
	type DealRow,
	listDealBoard,
	listDeals,
	restoreDeal,
} from "#/modules/deals/deals";
import {
	DEAL_STATUS_LABELS,
	DEAL_STATUSES,
	type DealSearch,
	type DealStatus,
	dealSearchSchema,
} from "#/modules/deals/schema";
import { getRecordFields } from "#/modules/fields/fields";
import { localized } from "#/modules/fields/schema";
import { formatValue } from "#/modules/fields/values";
import { listPipelines } from "#/modules/pipelines/pipelines";
import { TagPill } from "#/modules/records/components/TagEditor";
import { listWorkspaceTags } from "#/modules/records/records";
import {
	columnLabel,
	ViewToolbar,
} from "#/modules/views/components/ViewToolbar";
import { BUILT_IN_SORT, DEFAULT_COLUMNS } from "#/modules/views/schema";
import { listViews } from "#/modules/views/views";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed guard; listDeals requires deal:read
export const Route = createFileRoute("/_authed/deals/")({
	validateSearch: dealSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [pipelines, options, allTags, fields, views] = await Promise.all([
			listPipelines({ data: { includeArchived: true } }),
			getContactFormOptions(),
			listWorkspaceTags(),
			getRecordFields({ data: { objectKey: "deal" } }),
			listViews({ data: { objectKey: "deal" } }),
		]);
		const active = pipelines.filter((p) => !p.archivedAt);
		const boardPipeline =
			active.find((p) => p.id === deps.pipeline) ?? active[0] ?? null;
		const [list, board] = await Promise.all([
			deps.layout === "list" ? listDeals({ data: deps }) : null,
			deps.layout === "board" && boardPipeline
				? listDealBoard({
						data: { pipelineId: boardPipeline.id, search: deps },
					})
				: null,
		]);
		return {
			pipelines,
			boardPipeline,
			list,
			board,
			options,
			allTags,
			fields,
			views,
		};
	},
	component: DealsPage,
});

function DealsPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const {
		pipelines,
		boardPipeline,
		list,
		board,
		options,
		allTags,
		fields,
		views,
	} = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const can = {
		create: roleCan(access?.role, { deal: ["create"] }),
		update: roleCan(access?.role, { deal: ["update"] }),
		archive: roleCan(access?.role, { deal: ["delete"] }),
	};
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const columns = search.columns ?? DEFAULT_COLUMNS.deal;
	const sortable = new Set([
		...BUILT_IN_SORT.deal,
		...fields.fields.map((f) => `custom.${f.key}`),
	]);
	const money = (cents: number) => formatMoney(cents, fields.currency);
	const stageNames = new Map(
		pipelines.flatMap((p) =>
			p.stages.map((s) => [
				s.id,
				`${localized(p.name)} · ${localized(s.name)}`,
			]),
		),
	);

	const patch = useCallback(
		(p: Partial<DealSearch>) => {
			void navigate({ search: (prev) => ({ ...prev, ...p }) });
		},
		[navigate],
	);

	useEffect(() => {
		if (list && list.total > 0 && search.page > list.pageCount)
			patch({ page: list.pageCount });
	}, [list, search.page, patch]);

	const toggleArchived = async (row: DealRow) => {
		const archived = Boolean(row.archivedAt);
		if (
			!archived &&
			!window.confirm(m.deals_archive_confirm({ name: row.name }))
		)
			return;
		setStatus(null);
		try {
			await (archived ? restoreDeal : archiveDeal)({ data: { id: row.id } });
			setStatus({
				ok: true,
				message: archived
					? m.deals_restored({ name: row.name })
					: m.deals_archived({ name: row.name }),
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
					onSort={(p) => patch(p as Partial<DealSearch>)}
				>
					{label}
				</SortButton>
			</TableHead>
		) : (
			<TableHead key={column}>{label}</TableHead>
		);

	const cell = (row: DealRow, column: string): ReactNode => {
		switch (column) {
			case "valueCents":
				return <span className="tabular-nums">{money(row.valueCents)}</span>;
			case "stageId":
				return row.stageName ? localized(row.stageName) : m.common_none();
			case "status":
				return <StatusBadge status={row.status as DealStatus} />;
			case "contactId":
				return (
					<Link
						to="/contacts/$contactId"
						params={{ contactId: row.contactId }}
						className="hover:underline"
					>
						{row.contactName}
					</Link>
				);
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
			case "expectedCloseAt":
				return formatDay(row.expectedCloseAt);
			case "tags":
				return (
					<div className="flex max-w-48 flex-wrap gap-1">
						{row.tags.slice(0, 3).map((t) => (
							<TagPill key={t.id} tag={t} />
						))}
					</div>
				);
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

	const activePipelines = pipelines.filter((p) => !p.archivedAt);

	return (
		<div className="mx-auto max-w-7xl space-y-6 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">{m.deals_title()}</h1>
					<p className="text-sm text-muted-foreground">
						{list
							? m.deals_summary({
									count: list.total,
									value: money(list.totalValueCents),
								})
							: m.deals_subtitle()}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<fieldset className="inline-flex gap-1 rounded-lg bg-muted p-1">
						<legend className="sr-only">{m.deals_layout()}</legend>
						{(["list", "board"] as const).map((layout) => (
							<button
								key={layout}
								type="button"
								aria-pressed={search.layout === layout}
								onClick={() => patch({ layout, page: 1 })}
								className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm font-medium ${search.layout === layout ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
							>
								{layout === "list" ? (
									<List className="size-4" aria-hidden="true" />
								) : (
									<KanbanSquare className="size-4" aria-hidden="true" />
								)}
								{layout === "list"
									? m.deals_layout_list()
									: m.deals_layout_board()}
							</button>
						))}
					</fieldset>
					{can.create ? (
						<Button
							type="button"
							disabled={!activePipelines.length}
							onClick={() => setOpen(true)}
						>
							<Plus /> {m.deals_new()}
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
			{!activePipelines.length ? (
				<FormAlert message={m.deals_no_pipeline()} />
			) : null}

			<ViewToolbar
				objectKey="deal"
				state={search}
				views={views}
				defs={fields.fields}
				choices={{
					pipelineId: pipelines.map((p) => ({
						value: p.id,
						label: localized(p.name),
					})),
					stageId: [...stageNames].map(([value, label]) => ({ value, label })),
					status: DEAL_STATUSES.map((s) => ({
						value: s,
						label: DEAL_STATUS_LABELS[s](),
					})),
					companyId: options.companies.map((c) => ({
						value: c.id,
						label: c.name,
					})),
					ownerId: options.members.map((u) => ({ value: u.id, label: u.name })),
					tag: allTags.map((t) => ({ value: t.id, label: t.name })),
				}}
				onChange={(p) => patch(p as Partial<DealSearch>)}
				onViewsChanged={() => router.invalidate()}
				onStatus={setStatus}
			/>

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="deal-search"
					value={search.q}
					placeholder={m.deals_search_placeholder()}
					onSearch={(q) => patch({ q, page: 1 })}
				/>
				{search.layout === "board" ? (
					<FilterSelect
						id="deal-pipeline-filter"
						label={m.deal_pipeline()}
						value={boardPipeline?.id}
						allLabel={m.deal_pipeline()}
						options={activePipelines.map((p) => ({
							value: p.id,
							label: localized(p.name),
						}))}
						onChange={(v) => patch({ pipeline: v })}
					/>
				) : (
					<>
						<FilterSelect
							id="deal-status-filter"
							label={m.deal_status()}
							value={search.status}
							allLabel={m.deals_all_statuses()}
							options={DEAL_STATUSES.map((s) => ({
								value: s,
								label: DEAL_STATUS_LABELS[s](),
							}))}
							onChange={(v) =>
								patch({ status: v as DealStatus | undefined, page: 1 })
							}
						/>
						<FilterSelect
							id="deal-show-filter"
							label={m.common_show()}
							value={search.show === "archived" ? "archived" : undefined}
							allLabel={m.common_show_active()}
							options={[{ value: "archived", label: m.common_show_archived() }]}
							onChange={(v) =>
								patch({
									show: v === "archived" ? "archived" : "active",
									page: 1,
								})
							}
						/>
					</>
				)}
				<FilterSelect
					id="deal-tag-filter"
					label={m.tags_filter()}
					value={search.tag}
					allLabel={m.tags_all()}
					options={allTags.map((t) => ({ value: t.id, label: t.name }))}
					onChange={(v) => patch({ tag: v, page: 1 })}
				/>
			</div>

			{list ? (
				<>
					<div className="overflow-x-auto rounded-lg border bg-background">
						<Table>
							<TableHeader>
								<TableRow>
									{header("name", m.deal_name())}
									{columns.map((c) => header(c, columnLabel(c, fields.fields)))}
									<TableHead>
										<span className="sr-only">{m.list_actions()}</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{list.rows.length ? (
									list.rows.map((row) => (
										<TableRow key={row.id}>
											<TableCell>
												<Link
													to="/deals/$dealId"
													params={{ dealId: row.id }}
													className="font-medium hover:underline"
												>
													{row.name}
												</Link>
											</TableCell>
											{columns.map((c) => (
												<TableCell key={c}>{cell(row, c)}</TableCell>
											))}
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
																	: m.deals_archive_label({ name: row.name })
															}
															onClick={() => toggleArchived(row)}
														>
															{row.archivedAt ? (
																<ArchiveRestore />
															) : (
																<Archive />
															)}
														</Button>
													) : null}
												</div>
											</TableCell>
										</TableRow>
									))
								) : (
									<TableRow>
										<TableCell
											colSpan={columns.length + 2}
											className="h-24 text-center text-muted-foreground"
										>
											{m.deals_empty()}
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
					<ListPagination
						label={m.deals_pages()}
						total={list.total}
						pageCount={list.pageCount}
						state={search}
						onChange={(p) => patch(p as Partial<DealSearch>)}
					/>
				</>
			) : null}

			{board && boardPipeline ? (
				<div className="space-y-2">
					{board.truncated ? (
						<FormAlert message={m.deals_board_truncated()} />
					) : null}
					<div className="flex gap-4 overflow-x-auto pb-2">
						{boardPipeline.stages.map((stage) => {
							const cards = board.rows.filter((r) => r.stageId === stage.id);
							const total = cards.reduce((n, r) => n + r.valueCents, 0);
							return (
								<section
									key={stage.id}
									aria-labelledby={`stage-${stage.id}`}
									className="flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/50 p-3"
								>
									<header>
										<h2
											id={`stage-${stage.id}`}
											className="text-sm font-semibold"
										>
											{localized(stage.name)}
										</h2>
										<p className="text-xs text-muted-foreground">
											{m.deals_column_summary({
												count: cards.length,
												value: money(total),
											})}
										</p>
									</header>
									<ul className="space-y-2">
										{cards.map((row) => (
											<li
												key={row.id}
												className="space-y-2 rounded-md border bg-background p-3 shadow-sm"
											>
												<Link
													to="/deals/$dealId"
													params={{ dealId: row.id }}
													className="block font-medium hover:underline"
												>
													{row.name}
												</Link>
												<p className="text-xs text-muted-foreground">
													{row.contactName}
													{row.companyName ? ` · ${row.companyName}` : ""}
												</p>
												<p className="flex justify-between text-xs">
													<span className="tabular-nums">
														{money(row.valueCents)}
													</span>
													<span className="text-muted-foreground">
														{row.expectedCloseAt
															? formatDay(row.expectedCloseAt)
															: ""}
													</span>
												</p>
												{can.update ? (
													<StageMover
														dealId={row.id}
														dealName={row.name}
														stageId={row.stageId}
														stages={boardPipeline.stages}
														onMoved={async (stageName) => {
															setStatus({
																ok: true,
																message: m.deal_moved({
																	name: row.name,
																	stage: stageName,
																}),
															});
															await router.invalidate();
														}}
														onError={(message) =>
															setStatus({ ok: false, message })
														}
													/>
												) : null}
											</li>
										))}
									</ul>
								</section>
							);
						})}
					</div>
				</div>
			) : null}

			{open ? (
				<DealFormDialog
					open
					onOpenChange={setOpen}
					initial={emptyDeal(pipelines)}
					initialContact={null}
					initialCustom={{}}
					editing={false}
					fields={fields}
					options={{ pipelines, ...options }}
					onSave={async (value) => {
						const { id } = await createDeal({ data: value });
						setOpen(false);
						await router.invalidate();
						void navigate({ to: "/deals/$dealId", params: { dealId: id } });
					}}
				/>
			) : null}
		</div>
	);
}
