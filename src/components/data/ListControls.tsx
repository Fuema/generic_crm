import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	Search,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { CUSTOMER_PAGE_SIZES } from "#/lib/schema";

// Shared building blocks for the server-paginated lists (products, orders,
// invoices). The URL holds the state; these components only emit patches.

type ListState = {
	page: number;
	pageSize: number;
	q: string;
	sort: string;
	dir: "asc" | "desc";
};

export function SearchBox({
	id,
	value,
	placeholder,
	onSearch,
}: {
	id: string;
	value: string;
	placeholder: string;
	onSearch: (q: string) => void;
}) {
	// Local text keeps typing instant; the URL updates 300 ms after typing stops
	const [text, setText] = useState(value);
	useEffect(() => setText(value), [value]);
	useEffect(() => {
		if (text.trim() === value) return;
		const timer = setTimeout(() => onSearch(text.trim()), 300);
		return () => clearTimeout(timer);
	}, [text, value, onSearch]);

	return (
		<div className="flex-1 space-y-1.5">
			<Label htmlFor={id}>Search</Label>
			<div className="relative">
				<Search
					className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				/>
				<Input
					id={id}
					type="search"
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder={placeholder}
					maxLength={100}
					className="pl-8"
				/>
			</div>
		</div>
	);
}

export function FilterSelect({
	id,
	label,
	value,
	options,
	allLabel,
	onChange,
}: {
	id: string;
	label: string;
	value: string | undefined;
	options: { value: string; label: string }[];
	allLabel: string;
	onChange: (value: string | undefined) => void;
}) {
	const ALL = "__all__";
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Select
				value={value ?? ALL}
				onValueChange={(v) => onChange(v === ALL ? undefined : v)}
			>
				<SelectTrigger id={id} className="w-full md:w-44">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL}>{allLabel}</SelectItem>
					{options.map((o) => (
						<SelectItem key={o.value} value={o.value}>
							{o.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

// Column header that toggles sorting; aria-sort is set on the <th> by the caller
export function SortButton({
	column,
	state,
	onSort,
	children,
}: {
	column: string;
	state: Pick<ListState, "sort" | "dir">;
	onSort: (patch: { sort: string; dir: "asc" | "desc"; page: number }) => void;
	children: ReactNode;
}) {
	const active = state.sort === column;
	return (
		<button
			type="button"
			onClick={() =>
				onSort({
					sort: column,
					dir: active && state.dir === "asc" ? "desc" : "asc",
					page: 1,
				})
			}
			className="-ml-2 inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-muted"
		>
			{children}
			{active ? (
				state.dir === "asc" ? (
					<ArrowUp className="size-3.5" aria-hidden="true" />
				) : (
					<ArrowDown className="size-3.5" aria-hidden="true" />
				)
			) : (
				<ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />
			)}
		</button>
	);
}

export function ariaSort(
	state: Pick<ListState, "sort" | "dir">,
	column: string,
) {
	if (state.sort !== column) return undefined;
	return state.dir === "asc" ? "ascending" : "descending";
}

export function ListPagination({
	label,
	total,
	pageCount,
	state,
	onChange,
}: {
	label: string;
	total: number;
	pageCount: number;
	state: Pick<ListState, "page" | "pageSize">;
	onChange: (patch: { page: number; pageSize?: number }) => void;
}) {
	const page = Math.min(state.page, pageCount);
	const from = total === 0 ? 0 : (page - 1) * state.pageSize + 1;
	const to = Math.min(page * state.pageSize, total);
	const go = (p: number) =>
		onChange({ page: Math.min(Math.max(1, p), pageCount) });

	return (
		<nav
			aria-label={label}
			className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row"
		>
			<p className="text-muted-foreground" aria-live="polite">
				{total === 0 ? "Nothing to show" : `Showing ${from}–${to} of ${total}`}
			</p>
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-2">
					<Label
						htmlFor={`${label}-size`}
						className="font-normal whitespace-nowrap"
					>
						Rows per page
					</Label>
					<Select
						value={String(state.pageSize)}
						onValueChange={(v) => onChange({ pageSize: Number(v), page: 1 })}
					>
						<SelectTrigger id={`${label}-size`} className="w-20" size="sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CUSTOMER_PAGE_SIZES.map((n) => (
								<SelectItem key={n} value={String(n)}>
									{n}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<span className="whitespace-nowrap">
					Page {page} of {pageCount}
				</span>
				<div className="flex gap-1">
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => go(1)}
						disabled={page <= 1}
						aria-label="First page"
					>
						<ChevronsLeft />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => go(page - 1)}
						disabled={page <= 1}
						aria-label="Previous page"
					>
						<ChevronLeft />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => go(page + 1)}
						disabled={page >= pageCount}
						aria-label="Next page"
					>
						<ChevronRight />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => go(pageCount)}
						disabled={page >= pageCount}
						aria-label="Last page"
					>
						<ChevronsRight />
					</Button>
				</div>
			</div>
		</nav>
	);
}

const STATUS_STYLES: Record<
	string,
	{
		label: string;
		variant: "default" | "secondary" | "outline" | "destructive";
	}
> = {
	draft: { label: "Draft", variant: "outline" },
	confirmed: { label: "Confirmed", variant: "secondary" },
	fulfilled: { label: "Fulfilled", variant: "default" },
	cancelled: { label: "Cancelled", variant: "outline" },
	issued: { label: "Issued", variant: "secondary" },
	overdue: { label: "Overdue", variant: "destructive" },
	paid: { label: "Paid", variant: "default" },
	void: { label: "Void", variant: "outline" },
	active: { label: "Active", variant: "default" },
	inactive: { label: "Inactive", variant: "outline" },
};

export function DocStatusBadge({ status }: { status: string }) {
	const style = STATUS_STYLES[status] ?? {
		label: status,
		variant: "outline" as const,
	};
	return <Badge variant={style.variant}>{style.label}</Badge>;
}

// An issued invoice past its due date is shown as overdue
export function invoiceDisplayStatus(
	status: string,
	dueDate: Date | string | null,
) {
	return status === "issued" && dueDate && new Date(dueDate) < new Date()
		? "overdue"
		: status;
}

export function formatDate(value: Date | string | null | undefined) {
	return value ? new Date(value).toLocaleDateString() : "—";
}
