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
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { formatMoney, quoteNumberLabel } from "#/lib/money";
import { roleCan } from "#/lib/permissions";
import { getContactFormOptions } from "#/modules/contacts/contacts";
import { formatDay } from "#/modules/deals/components/DealBits";
import {
	type ContactChoice,
	ContactPicker,
} from "#/modules/deals/components/DealFormDialog";
import { getRecordFields } from "#/modules/fields/fields";
import { formatValue } from "#/modules/fields/values";
import { QuoteStatusBadge } from "#/modules/quotes/components/QuoteStatusBadge";
import {
	createQuote,
	listQuotes,
	type QuoteRow,
} from "#/modules/quotes/quotes";
import {
	QUOTE_DISPLAY_STATUSES,
	QUOTE_STATUS_LABELS,
	QUOTE_STATUSES,
	type QuoteDisplayStatus,
	type QuoteSearch,
	quoteSearchSchema,
} from "#/modules/quotes/schema";
import { listWorkspaceTags } from "#/modules/records/records";
import {
	columnLabel,
	ViewToolbar,
} from "#/modules/views/components/ViewToolbar";
import { BUILT_IN_SORT, DEFAULT_COLUMNS } from "#/modules/views/schema";
import { listViews } from "#/modules/views/views";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed guard; listQuotes requires quote:read
export const Route = createFileRoute("/_authed/quotes/")({
	validateSearch: quoteSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [list, options, allTags, fields, views] = await Promise.all([
			listQuotes({ data: deps }),
			getContactFormOptions(),
			listWorkspaceTags(),
			getRecordFields({ data: { objectKey: "quote" } }),
			listViews({ data: { objectKey: "quote" } }),
		]);
		return { ...list, options, allTags, fields, views };
	},
	component: QuotesPage,
});

function QuotesPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const {
		rows,
		total,
		pageCount,
		totalValueCents,
		options,
		allTags,
		fields,
		views,
	} = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const canCreate = roleCan(access?.role, { quote: ["create"] });
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const [picking, setPicking] = useState(false);
	const [contact, setContact] = useState<ContactChoice | null>(null);
	const [busy, setBusy] = useState(false);
	const columns = search.columns ?? DEFAULT_COLUMNS.quote;
	const sortable = new Set([
		...BUILT_IN_SORT.quote,
		...fields.fields.map((f) => `custom.${f.key}`),
	]);

	const patch = useCallback(
		(p: Partial<QuoteSearch>) => {
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
					onSort={(p) => patch(p as Partial<QuoteSearch>)}
				>
					{label}
				</SortButton>
			</TableHead>
		) : (
			<TableHead key={column}>{label}</TableHead>
		);

	const cell = (row: QuoteRow, column: string): ReactNode => {
		switch (column) {
			case "status":
				return <QuoteStatusBadge status={row.displayStatus} />;
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
			case "totalCents":
				return (
					<span className="tabular-nums">
						{formatMoney(row.totalCents, row.currency)}
					</span>
				);
			case "validUntil":
				return formatDay(row.validUntil);
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
					<h1 className="text-2xl font-bold">{m.quotes_title()}</h1>
					<p className="text-sm text-muted-foreground">
						{m.quotes_summary({
							count: total,
							value: formatMoney(totalValueCents, fields.currency),
						})}
					</p>
				</div>
				{canCreate ? (
					<Button
						type="button"
						onClick={() => {
							setContact(null);
							setPicking(true);
						}}
					>
						<Plus /> {m.quotes_new()}
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
				objectKey="quote"
				state={search}
				views={views}
				defs={fields.fields}
				choices={{
					status: QUOTE_STATUSES.map((s) => ({
						value: s,
						label: QUOTE_STATUS_LABELS[s](),
					})),
					companyId: options.companies.map((c) => ({
						value: c.id,
						label: c.name,
					})),
					ownerId: options.members.map((u) => ({ value: u.id, label: u.name })),
					tag: allTags.map((t) => ({ value: t.id, label: t.name })),
				}}
				onChange={(p) => patch(p as Partial<QuoteSearch>)}
				onViewsChanged={() => router.invalidate()}
				onStatus={setStatus}
			/>

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="quote-search"
					value={search.q}
					placeholder={m.quotes_search_placeholder()}
					onSearch={(q) => patch({ q, page: 1 })}
				/>
				<FilterSelect
					id="quote-status-filter"
					label={m.quote_status()}
					value={search.status}
					allLabel={m.deals_all_statuses()}
					options={QUOTE_DISPLAY_STATUSES.map((s) => ({
						value: s,
						label: QUOTE_STATUS_LABELS[s](),
					}))}
					onChange={(v) =>
						patch({ status: v as QuoteDisplayStatus | undefined, page: 1 })
					}
				/>
				<FilterSelect
					id="quote-show-filter"
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
							{header("number", m.quote_number())}
							{columns.map((c) => header(c, columnLabel(c, fields.fields)))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length ? (
							rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										<Link
											to="/quotes/$quoteId"
											params={{ quoteId: row.id }}
											className="font-medium hover:underline"
										>
											{quoteNumberLabel(row.number)}
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
									{m.quotes_empty()}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<ListPagination
				label={m.quotes_pages()}
				total={total}
				pageCount={pageCount}
				state={search}
				onChange={(p) => patch(p as Partial<QuoteSearch>)}
			/>

			<Dialog open={picking} onOpenChange={setPicking}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{m.quotes_new()}</DialogTitle>
						<DialogDescription>{m.quotes_new_description()}</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="new-quote-contact">{m.deal_contact()}</Label>
						<ContactPicker
							id="new-quote-contact"
							value={contact}
							invalid={false}
							onChange={setContact}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setPicking(false)}
						>
							{m.common_cancel()}
						</Button>
						<Button
							type="button"
							disabled={!contact || busy}
							onClick={async () => {
								if (!contact) return;
								setBusy(true);
								try {
									const { id } = await createQuote({
										data: { contactId: contact.id },
									});
									void navigate({
										to: "/quotes/$quoteId",
										params: { quoteId: id },
									});
								} catch (e) {
									setStatus({
										ok: false,
										message: await serverErrorMessage(e),
									});
									setPicking(false);
								} finally {
									setBusy(false);
								}
							}}
						>
							{m.quotes_create_draft()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
