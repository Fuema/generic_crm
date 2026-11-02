import {
	createColumnHelper,
	flexRender,
	rowPaginationFeature,
	rowSortingFeature,
	type SortingState,
	tableFeatures,
	type Updater,
	useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Trash2 } from "lucide-react";
import { useMemo } from "react";
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
import type { CustomerRow } from "#/lib/customers";
import type { CUSTOMER_SORT_COLUMNS, CustomerSearch } from "#/lib/schema";
import { CustomerStatusBadge } from "./CustomerStatusBadge";

// Only the features this table uses. Sorting and pagination are "manual": the
// server does the work, the table just holds the state and renders the page.
const features = tableFeatures({ rowSortingFeature, rowPaginationFeature });
const column = createColumnHelper<typeof features, CustomerRow>();

type SortColumn = (typeof CUSTOMER_SORT_COLUMNS)[number];

function resolve<T>(updater: Updater<T>, previous: T): T {
	return typeof updater === "function"
		? (updater as (old: T) => T)(previous)
		: updater;
}

export function CustomersTable({
	rows,
	total,
	pageCount,
	search,
	onSearchChange,
	canUpdate,
	canDelete,
	onEdit,
	onDelete,
}: {
	rows: CustomerRow[];
	total: number;
	pageCount: number;
	search: CustomerSearch;
	onSearchChange: (patch: Partial<CustomerSearch>) => void;
	canUpdate: boolean;
	canDelete: boolean;
	onEdit: (row: CustomerRow) => void;
	onDelete: (row: CustomerRow) => void;
}) {
	const columns = useMemo(
		() =>
			column.columns([
				column.accessor("name", {
					header: "Name",
					cell: (info) => (
						<span className="font-medium">{info.getValue()}</span>
					),
				}),
				column.accessor("email", {
					header: "Email",
					cell: (info) => (
						<a href={`mailto:${info.getValue()}`} className="hover:underline">
							{info.getValue()}
						</a>
					),
				}),
				column.accessor("phone", {
					header: "Phone",
					enableSorting: false,
					cell: (info) => info.getValue() ?? "—",
				}),
				column.accessor("company", {
					header: "Company",
					cell: (info) => info.getValue() ?? "—",
				}),
				column.accessor("status", {
					header: "Status",
					cell: (info) => <CustomerStatusBadge status={info.getValue()} />,
				}),
				column.accessor("country", {
					header: "Location",
					cell: (info) => {
						const city = info.row.original.city;
						const country = countryName(info.getValue());
						return [city, country].filter(Boolean).join(", ") || "—";
					},
				}),
				column.accessor("createdAt", {
					header: "Added",
					cell: (info) => new Date(info.getValue()).toLocaleDateString(),
				}),
				column.display({
					id: "actions",
					header: () => <span className="sr-only">Actions</span>,
					cell: (info) => {
						const row = info.row.original;
						return (
							<div className="flex justify-end gap-1">
								{canUpdate ? (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => onEdit(row)}
										aria-label={`Edit ${row.name}`}
									>
										<Pencil />
									</Button>
								) : null}
								{canDelete ? (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => onDelete(row)}
										aria-label={`Delete ${row.name}`}
									>
										<Trash2 />
									</Button>
								) : null}
							</div>
						);
					},
				}),
			]),
		[canUpdate, canDelete, onEdit, onDelete],
	);

	const sorting: SortingState = [
		{ id: search.sort, desc: search.dir === "desc" },
	];
	const pagination = { pageIndex: search.page - 1, pageSize: search.pageSize };

	const table = useTable({
		features,
		columns,
		data: rows,
		getRowId: (row) => row.id,
		manualSorting: true,
		manualPagination: true,
		rowCount: total,
		pageCount,
		enableSortingRemoval: false,
		enableMultiSort: false,
		state: { sorting, pagination },
		onSortingChange: (updater) => {
			const [next] = resolve(updater, sorting);
			if (!next) return;
			// A new sort order starts again from page 1
			onSearchChange({
				sort: next.id as SortColumn,
				dir: next.desc ? "desc" : "asc",
				page: 1,
			});
		},
		onPaginationChange: (updater) => {
			const next = resolve(updater, pagination);
			onSearchChange({
				page: next.pageSize !== search.pageSize ? 1 : next.pageIndex + 1,
				pageSize: next.pageSize as CustomerSearch["pageSize"],
			});
		},
	});

	return (
		<div className="overflow-x-auto rounded-lg border bg-background">
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((group) => (
						<TableRow key={group.id}>
							{group.headers.map((header) => {
								const sorted = header.column.getIsSorted();
								return (
									<TableHead
										key={header.id}
										aria-sort={
											sorted === "asc"
												? "ascending"
												: sorted === "desc"
													? "descending"
													: undefined
										}
										className="whitespace-nowrap"
									>
										{header.column.getCanSort() ? (
											<button
												type="button"
												onClick={header.column.getToggleSortingHandler()}
												className="-ml-2 inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted"
											>
												{flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
												{sorted === "asc" ? (
													<ArrowUp className="size-3.5" aria-hidden="true" />
												) : sorted === "desc" ? (
													<ArrowDown className="size-3.5" aria-hidden="true" />
												) : (
													<ArrowUpDown
														className="size-3.5 opacity-40"
														aria-hidden="true"
													/>
												)}
											</button>
										) : (
											flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)
										)}
									</TableHead>
								);
							})}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.length ? (
						table.getRowModel().rows.map((row) => (
							<TableRow key={row.id}>
								{row.getAllCells().map((cell) => (
									<TableCell key={cell.id} className="whitespace-nowrap">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell
								colSpan={columns.length}
								className="h-24 text-center text-muted-foreground"
							>
								No customers match these filters.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
