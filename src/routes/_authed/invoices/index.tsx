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
import { formatMoney, orderNumberLabel } from "#/lib/money";
import { roleCan } from "#/lib/permissions";
import { getContactFormOptions } from "#/modules/contacts/contacts";
import { formatDay } from "#/modules/deals/components/DealBits";
import { DocumentStatusBadge } from "#/modules/documents/components/DocumentBits";
import { NewDocumentDialog } from "#/modules/documents/components/NewDocumentDialog";
import { getRecordFields } from "#/modules/fields/fields";
import { formatValue } from "#/modules/fields/values";
import {
	invoiceStatus,
	invoiceTitle,
} from "#/modules/invoices/components/invoiceBits";
import {
	createInvoice,
	type InvoiceRow,
	listInvoices,
} from "#/modules/invoices/invoices";
import {
	INVOICE_DISPLAY_STATUSES,
	INVOICE_STATUS_LABELS,
	INVOICE_STATUSES,
	type InvoiceDisplayStatus,
	type InvoiceSearch,
	invoiceSearchSchema,
} from "#/modules/invoices/schema";
import { listWorkspaceTags } from "#/modules/records/records";
import {
	columnLabel,
	ViewToolbar,
} from "#/modules/views/components/ViewToolbar";
import { BUILT_IN_SORT, DEFAULT_COLUMNS } from "#/modules/views/schema";
import { listViews } from "#/modules/views/views";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed guard; listInvoices requires invoice:read
export const Route = createFileRoute("/_authed/invoices/")({
	validateSearch: invoiceSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [list, options, allTags, fields, views] = await Promise.all([
			listInvoices({ data: deps }),
			getContactFormOptions(),
			listWorkspaceTags(),
			getRecordFields({ data: { objectKey: "invoice" } }),
			listViews({ data: { objectKey: "invoice" } }),
		]);
		return { ...list, options, allTags, fields, views };
	},
	component: InvoicesPage,
});

function InvoicesPage() {
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
	const canCreate = roleCan(access?.role, { invoice: ["create"] });
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const [picking, setPicking] = useState(false);
	const columns = search.columns ?? DEFAULT_COLUMNS.invoice;
	const sortable = new Set([
		...BUILT_IN_SORT.invoice,
		...fields.fields.map((f) => `custom.${f.key}`),
	]);

	const patch = useCallback(
		(p: Partial<InvoiceSearch>) => {
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
					onSort={(p) => patch(p as Partial<InvoiceSearch>)}
				>
					{label}
				</SortButton>
			</TableHead>
		) : (
			<TableHead key={column}>{label}</TableHead>
		);

	const cell = (row: InvoiceRow, column: string): ReactNode => {
		switch (column) {
			case "status":
				return <DocumentStatusBadge {...invoiceStatus(row.displayStatus)} />;
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
			case "orderId":
				return row.orderId && row.orderNumber ? (
					<Link
						to="/orders/$orderId"
						params={{ orderId: row.orderId }}
						className="hover:underline"
					>
						{orderNumberLabel(row.orderNumber)}
					</Link>
				) : (
					m.common_none()
				);
			case "issueDate":
				return formatDay(row.issueDate);
			case "dueDate":
				return formatDay(row.dueDate);
			case "totalCents":
				return (
					<span className="tabular-nums">
						{formatMoney(row.totalCents, row.currency)}
					</span>
				);
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
					<h1 className="text-2xl font-bold">{m.invoices_title()}</h1>
					<p className="text-sm text-muted-foreground">
						{m.invoices_summary({
							count: total,
							value: formatMoney(totalValueCents, fields.currency),
						})}
					</p>
				</div>
				{canCreate ? (
					<Button type="button" onClick={() => setPicking(true)}>
						<Plus /> {m.invoices_new()}
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
				objectKey="invoice"
				state={search}
				views={views}
				defs={fields.fields}
				choices={{
					status: INVOICE_STATUSES.map((s) => ({
						value: s,
						label: INVOICE_STATUS_LABELS[s](),
					})),
					companyId: options.companies.map((c) => ({
						value: c.id,
						label: c.name,
					})),
					ownerId: options.members.map((u) => ({ value: u.id, label: u.name })),
					tag: allTags.map((t) => ({ value: t.id, label: t.name })),
				}}
				onChange={(p) => patch(p as Partial<InvoiceSearch>)}
				onViewsChanged={() => router.invalidate()}
				onStatus={setStatus}
			/>

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="invoice-search"
					value={search.q}
					placeholder={m.invoices_search_placeholder()}
					onSearch={(q) => patch({ q, page: 1 })}
				/>
				<FilterSelect
					id="invoice-status-filter"
					label={m.quote_status()}
					value={search.status}
					allLabel={m.deals_all_statuses()}
					options={INVOICE_DISPLAY_STATUSES.map((s) => ({
						value: s,
						label: INVOICE_STATUS_LABELS[s](),
					}))}
					onChange={(v) =>
						patch({ status: v as InvoiceDisplayStatus | undefined, page: 1 })
					}
				/>
				<FilterSelect
					id="invoice-show-filter"
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
											to="/invoices/$invoiceId"
											params={{ invoiceId: row.id }}
											className="font-medium hover:underline"
										>
											{invoiceTitle(row.year, row.number)}
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
									{m.invoices_empty()}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<ListPagination
				label={m.invoices_pages()}
				total={total}
				pageCount={pageCount}
				state={search}
				onChange={(p) => patch(p as Partial<InvoiceSearch>)}
			/>

			<NewDocumentDialog
				open={picking}
				onOpenChange={setPicking}
				title={m.invoices_new()}
				onCreate={async (contactId) => {
					const { id } = await createInvoice({ data: { contactId } });
					void navigate({
						to: "/invoices/$invoiceId",
						params: { invoiceId: id },
					});
				}}
				onError={(message) => setStatus({ ok: false, message })}
			/>
		</div>
	);
}
