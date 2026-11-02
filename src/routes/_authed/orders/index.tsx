import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, Plus } from "lucide-react";
import { useCallback } from "react";
import {
	ariaSort,
	DocStatusBadge,
	FilterSelect,
	formatDate,
	ListPagination,
	SearchBox,
	SortButton,
} from "#/components/data/ListControls";
import { buttonVariants } from "#/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { formatMoney, orderNumberLabel } from "#/lib/money";
import { listOrders } from "#/lib/orders";
import { roleCan } from "#/lib/permissions";
import {
	ORDER_STATUSES,
	type OrderSearch,
	orderSearchSchema,
} from "#/lib/schema";

// Protected by the _authed guard; listOrders requires order:read
export const Route = createFileRoute("/_authed/orders/")({
	validateSearch: orderSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => listOrders({ data: deps }),
	component: OrdersPage,
});

const STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	confirmed: "Confirmed",
	fulfilled: "Fulfilled",
	cancelled: "Cancelled",
};

function OrdersPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { rows, total, pageCount } = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const canCreate = roleCan(access?.role, { order: ["create"] });
	const patch = useCallback(
		(p: Partial<OrderSearch>) =>
			void navigate({ search: (prev) => ({ ...prev, ...p }) }),
		[navigate],
	);
	const sort = (p: { sort: string; dir: "asc" | "desc"; page: number }) =>
		patch(p as Partial<OrderSearch>);

	return (
		<div className="mx-auto max-w-7xl space-y-6 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">Orders</h1>
					<p className="text-sm text-muted-foreground">
						Orders in {access?.workspace?.name ?? "this workspace"}.
					</p>
				</div>
				{canCreate ? (
					<Link to="/orders/new" className={buttonVariants()}>
						<Plus /> New order
					</Link>
				) : (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Lock className="size-4" aria-hidden="true" /> View-only access
					</p>
				)}
			</div>

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="order-search"
					value={search.q}
					placeholder="Order number (ORD-0012) or customer name"
					onSearch={(q) => patch({ q, page: 1 })}
				/>
				<FilterSelect
					id="order-status-filter"
					label="Status"
					value={search.status}
					allLabel="All statuses"
					options={ORDER_STATUSES.map((s) => ({
						value: s,
						label: STATUS_LABELS[s],
					}))}
					onChange={(v) =>
						patch({ status: v as OrderSearch["status"], page: 1 })
					}
				/>
			</div>

			<div className="overflow-x-auto rounded-lg border bg-background">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead aria-sort={ariaSort(search, "number")}>
								<SortButton column="number" state={search} onSort={sort}>
									Order
								</SortButton>
							</TableHead>
							<TableHead>Customer</TableHead>
							<TableHead aria-sort={ariaSort(search, "orderDate")}>
								<SortButton column="orderDate" state={search} onSort={sort}>
									Date
								</SortButton>
							</TableHead>
							<TableHead aria-sort={ariaSort(search, "status")}>
								<SortButton column="status" state={search} onSort={sort}>
									Status
								</SortButton>
							</TableHead>
							<TableHead>Invoice</TableHead>
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
							rows.map((o) => (
								<TableRow key={o.id}>
									<TableCell>
										<Link
											to="/orders/$orderId"
											params={{ orderId: o.id }}
											className="font-medium hover:underline"
										>
											{orderNumberLabel(o.number)}
										</Link>
									</TableCell>
									<TableCell>{o.customerName}</TableCell>
									<TableCell>{formatDate(o.orderDate)}</TableCell>
									<TableCell>
										<DocStatusBadge status={o.status} />
									</TableCell>
									<TableCell>
										{o.invoiceId ? (
											<Link
												to="/invoices/$invoiceId"
												params={{ invoiceId: o.invoiceId }}
												className="hover:underline"
											>
												View
											</Link>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(o.totalCents, o.currency)}
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={6}
									className="h-24 text-center text-muted-foreground"
								>
									No orders match these filters.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<ListPagination
				label="Order pages"
				total={total}
				pageCount={pageCount}
				state={search}
				onChange={(p) => patch(p as Partial<OrderSearch>)}
			/>
		</div>
	);
}
