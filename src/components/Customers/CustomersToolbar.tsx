import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
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
import { COUNTRY_OPTIONS } from "#/lib/countries";
import {
	CUSTOMER_STATUSES,
	type CustomerSearch,
	type CustomerStatus,
} from "#/lib/schema";
import { STATUS_LABELS } from "./CustomerStatusBadge";

const ALL = "__all__";

export function CustomersToolbar({
	search,
	onSearchChange,
}: {
	search: CustomerSearch;
	onSearchChange: (patch: Partial<CustomerSearch>) => void;
}) {
	// Local text so typing stays instant; the URL (and the query) updates 300 ms
	// after the user stops typing
	const [text, setText] = useState(search.q);
	useEffect(() => setText(search.q), [search.q]);
	useEffect(() => {
		if (text.trim() === search.q) return;
		const timer = setTimeout(
			() => onSearchChange({ q: text.trim(), page: 1 }),
			300,
		);
		return () => clearTimeout(timer);
	}, [text, search.q, onSearchChange]);

	const filtered = Boolean(search.q || search.status || search.country);

	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-end">
			<div className="flex-1 space-y-1.5">
				<Label htmlFor="customer-search">Search</Label>
				<div className="relative">
					<Search
						className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						id="customer-search"
						type="search"
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder="Name, email, company, phone or city"
						maxLength={100}
						className="pl-8"
					/>
				</div>
			</div>

			<div className="space-y-1.5">
				<Label htmlFor="customer-status-filter">Status</Label>
				<Select
					value={search.status ?? ALL}
					onValueChange={(v) =>
						onSearchChange({
							status: v === ALL ? undefined : (v as CustomerStatus),
							page: 1,
						})
					}
				>
					<SelectTrigger id="customer-status-filter" className="w-full md:w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>All statuses</SelectItem>
						{CUSTOMER_STATUSES.map((s) => (
							<SelectItem key={s} value={s}>
								{STATUS_LABELS[s]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-1.5">
				<Label htmlFor="customer-country-filter">Country</Label>
				<Select
					value={search.country ?? ALL}
					onValueChange={(v) =>
						onSearchChange({ country: v === ALL ? undefined : v, page: 1 })
					}
				>
					<SelectTrigger
						id="customer-country-filter"
						className="w-full md:w-48"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="max-h-72">
						<SelectItem value={ALL}>All countries</SelectItem>
						{COUNTRY_OPTIONS.map((c) => (
							<SelectItem key={c.code} value={c.code}>
								{c.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{filtered ? (
				<Button
					type="button"
					variant="ghost"
					onClick={() => {
						setText("");
						onSearchChange({
							q: "",
							status: undefined,
							country: undefined,
							page: 1,
						});
					}}
				>
					<X /> Clear filters
				</Button>
			) : null}
		</div>
	);
}
