import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	ariaSort,
	DocStatusBadge,
	FilterSelect,
	formatDate,
	invoiceDisplayStatus,
	ListPagination,
	SearchBox,
	SortButton,
} from "#/components/data/ListControls";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { listInvoices } from "#/lib/invoices";
import { formatMoney, invoiceNumberLabel, orderNumberLabel } from "#/lib/money";
import { type InvoiceSearch, invoiceSearchSchema } from "#/lib/schema";

// Protected by the _authed guard; listInvoices requires invoice:read.
// Invoices are created from confirmed orders, so there's no "New invoice" button.
export const Route = createFileRoute("/_authed/invoices/")({
	validateSearch: invoiceSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => listInvoices({ data: deps }),
	component: InvoicesPage,
});

const STATUS_OPTIONS = [
	{ value: "draft", label: "Draft" },
	{ value: "issued", label: "Issued" },
	{ value: "overdue", label: "Overdue" },
	{ value: "paid", label: "Paid" },
	{ value: "void", label: "Void" },
];

function InvoicesPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { rows, total, pageCount } = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const patch = useCallback(
		(p: Partial<InvoiceSearch>) =>
			void navigate({ search: (prev) => ({ ...prev, ...p }) }),
		[navigate],
	);
	const sort = (p: { sort: string; dir: "asc" | "desc"; page: number }) =>
		patch(p as Partial<InvoiceSearch>);

	return (
		<div className="mx-auto max-w-7xl space-y-6 p-6">
			<div>
				<h1 className="text-2xl font-bold">Invoices</h1>
				<p className="text-sm text-muted-foreground">
					Invoices in {access?.workspace?.name ?? "this workspace"}. Create one
					from a confirmed order.
				</p>
			</div>

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="invoice-search"
					value={search.q}
					placeholder="Invoice number (INV-2026-0003) or customer name"
					onSearch={(q) => patch({ q, page: 1 })}
				/>
				<FilterSelect
					id="invoice-status-filter"
					label="Status"
					value={search.status}
					allLabel="All statuses"
					options={STATUS_OPTIONS}
					onChange={(v) =>
						patch({ status: v as InvoiceSearch["status"], page: 1 })
					}
				/>
			</div>

			<div className="overflow-x-auto rounded-lg border bg-background">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead aria-sort={ariaSort(search, "number")}>
								<SortButton column="number" state={search} onSort={sort}>
									Invoice
								</SortButton>
							</TableHead>
							<TableHead>Customer</TableHead>
							<TableHead>Order</TableHead>
							<TableHead aria-sort={ariaSort(search, "issueDate")}>
								<SortButton column="issueDate" state={search} onSort={sort}>
									Issued
								</SortButton>
							</TableHead>
							<TableHead aria-sort={ariaSort(search, "dueDate")}>
								<SortButton column="dueDate" state={search} onSort={sort}>
									Due
								</SortButton>
							</TableHead>
							<TableHead aria-sort={ariaSort(search, "status")}>
								<SortButton column="status" state={search} onSort={sort}>
									Status
								</SortButton>
							</TableHead>
							<TableHead
								aria-sort={ariaSort(search, "totalCents")}
								className="text-right"
							>
								<SortButton column="totalCents" state={search} onSort={sort}>
									Total
								</SortButton>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length ? (
							rows.map((i) => (
								<TableRow key={i.id}>
									<TableCell>
										<Link
											to="/invoices/$invoiceId"
											params={{ invoiceId: i.id }}
											className="font-medium hover:underline"
										>
											{invoiceNumberLabel(i.year, i.number)}
										</Link>
									</TableCell>
									<TableCell>{i.customerName}</TableCell>
									<TableCell className="text-muted-foreground">
										{orderNumberLabel(i.orderNumber)}
									</TableCell>
									<TableCell>{formatDate(i.issueDate)}</TableCell>
									<TableCell>{formatDate(i.dueDate)}</TableCell>
									<TableCell>
										<DocStatusBadge
											status={invoiceDisplayStatus(i.status, i.dueDate)}
										/>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(i.totalCents, i.currency)}
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={7}
									className="h-24 text-center text-muted-foreground"
								>
									No invoices match these filters.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<ListPagination
				label="Invoice pages"
				total={total}
				pageCount={pageCount}
				state={search}
				onChange={(p) => patch(p as Partial<InvoiceSearch>)}
			/>
		</div>
	);
}
