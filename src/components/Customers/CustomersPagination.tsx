import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { CUSTOMER_PAGE_SIZES, type CustomerSearch } from "#/lib/schema";

export function CustomersPagination({
	total,
	pageCount,
	search,
	onSearchChange,
}: {
	total: number;
	pageCount: number;
	search: CustomerSearch;
	onSearchChange: (patch: Partial<CustomerSearch>) => void;
}) {
	const page = Math.min(search.page, pageCount);
	const from = total === 0 ? 0 : (page - 1) * search.pageSize + 1;
	const to = Math.min(page * search.pageSize, total);
	const go = (p: number) =>
		onSearchChange({ page: Math.min(Math.max(1, p), pageCount) });

	return (
		<nav
			aria-label="Customer pages"
			className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row"
		>
			<p className="text-muted-foreground" aria-live="polite">
				{total === 0 ? "No customers" : `Showing ${from}–${to} of ${total}`}
			</p>
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-2">
					<Label
						htmlFor="customer-page-size"
						className="font-normal whitespace-nowrap"
					>
						Rows per page
					</Label>
					<Select
						value={String(search.pageSize)}
						onValueChange={(v) =>
							onSearchChange({
								pageSize: Number(v) as CustomerSearch["pageSize"],
								page: 1,
							})
						}
					>
						<SelectTrigger id="customer-page-size" className="w-20" size="sm">
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
