import { useForm } from "@tanstack/react-form";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import {
	FieldError,
	FormAlert,
	fieldErrors,
} from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/Customers/CustomerFormDialog";
import {
	ariaSort,
	DocStatusBadge,
	FilterSelect,
	ListPagination,
	SearchBox,
	SortButton,
} from "#/components/data/ListControls";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import { getBillingSettings } from "#/lib/billing";
import { centsToInput, formatMoney } from "#/lib/money";
import { roleCan } from "#/lib/permissions";
import {
	createProduct,
	deleteProduct,
	listProducts,
	type ProductRow,
	updateProduct,
} from "#/lib/products";
import {
	type ProductInput,
	type ProductSearch,
	productInputSchema,
	productSearchSchema,
} from "#/lib/schema";

// Protected by the _authed guard; listProducts requires product:read
export const Route = createFileRoute("/_authed/products")({
	validateSearch: productSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [list, settings] = await Promise.all([
			listProducts({ data: deps }),
			getBillingSettings(),
		]);
		return { ...list, currency: settings.currency };
	},
	component: ProductsPage,
});

const EMPTY: ProductInput = {
	name: "",
	sku: "",
	description: "",
	price: "",
	active: true,
};

function ProductForm({
	initial,
	submitLabel,
	onSave,
	onCancel,
}: {
	initial: ProductInput;
	submitLabel: string;
	onSave: (value: ProductInput) => Promise<void>;
	onCancel: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: initial,
		validators: { onBlur: productInputSchema, onSubmit: productInputSchema },
		onSubmit: async ({ value }) => {
			setError(null);
			try {
				await onSave(productInputSchema.parse(value));
			} catch (e) {
				setError(await serverErrorMessage(e));
			}
		},
	});

	const text = (
		name: "name" | "sku" | "price",
		label: string,
		extra: { placeholder?: string; maxLength: number; inputMode?: "decimal" },
	) => (
		<form.Field name={name}>
			{(field) => (
				<div className="space-y-2">
					<Label htmlFor={`product-${name}`}>{label} *</Label>
					<Input
						id={`product-${name}`}
						value={field.state.value}
						onBlur={field.handleBlur}
						onChange={(e) => field.handleChange(e.target.value)}
						autoComplete="off"
						aria-required
						aria-invalid={fieldErrors(field.state.meta).length > 0}
						aria-describedby={`product-${name}-error`}
						{...extra}
					/>
					<FieldError id={`product-${name}-error`} meta={field.state.meta} />
				</div>
			)}
		</form.Field>
	);

	return (
		<form
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-4"
		>
			<FormAlert message={error} />
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="sm:col-span-2">
					{text("name", "Name", { maxLength: 100 })}
				</div>
				{text("sku", "SKU", { maxLength: 32, placeholder: "WIDGET-01" })}
				{text("price", "Unit price", {
					maxLength: 13,
					placeholder: "19.99",
					inputMode: "decimal",
				})}
			</div>
			<form.Field name="description">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="product-description">Description</Label>
						<Textarea
							id="product-description"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							maxLength={500}
							rows={2}
						/>
						<FieldError
							id="product-description-error"
							meta={field.state.meta}
						/>
					</div>
				)}
			</form.Field>
			<form.Field name="active">
				{(field) => (
					<div className="flex items-center gap-2">
						<Checkbox
							id="product-active"
							checked={field.state.value}
							onCheckedChange={(c) => field.handleChange(c === true)}
						/>
						<Label htmlFor="product-active" className="font-normal">
							Active (can be added to new orders)
						</Label>
					</div>
				)}
			</form.Field>
			<DialogFooter>
				<Button type="button" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
					{([canSubmit, isSubmitting]) => (
						<Button type="submit" disabled={!canSubmit || isSubmitting}>
							{isSubmitting ? "Saving..." : submitLabel}
						</Button>
					)}
				</form.Subscribe>
			</DialogFooter>
		</form>
	);
}

function ProductsPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { rows, total, pageCount, currency } = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const can = {
		create: roleCan(access?.role, { product: ["create"] }),
		update: roleCan(access?.role, { product: ["update"] }),
		delete: roleCan(access?.role, { product: ["delete"] }),
	};
	const [editing, setEditing] = useState<ProductRow | null>(null);
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);

	const patch = useCallback(
		(p: Partial<ProductSearch>) =>
			void navigate({ search: (prev) => ({ ...prev, ...p }) }),
		[navigate],
	);

	const remove = async (row: ProductRow) => {
		if (!window.confirm(`Delete ${row.name}? This can't be undone.`)) return;
		setStatus(null);
		try {
			await deleteProduct({ data: { id: row.id } });
			setStatus({ ok: true, message: `${row.name} was deleted.` });
			await router.invalidate();
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	return (
		<div className="mx-auto max-w-7xl space-y-6 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">Products</h1>
					<p className="text-sm text-muted-foreground">
						The catalog orders are built from. Prices in {currency}.
					</p>
				</div>
				{can.create ? (
					<Button
						type="button"
						onClick={() => {
							setEditing(null);
							setOpen(true);
						}}
					>
						<Plus /> New product
					</Button>
				) : (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Lock className="size-4" aria-hidden="true" /> View-only access
					</p>
				)}
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="product-search"
					value={search.q}
					placeholder="Name or SKU"
					onSearch={(q) => patch({ q, page: 1 })}
				/>
				<FilterSelect
					id="product-status-filter"
					label="Status"
					value={search.status}
					allLabel="All products"
					options={[
						{ value: "active", label: "Active" },
						{ value: "inactive", label: "Inactive" },
					]}
					onChange={(v) =>
						patch({ status: v as ProductSearch["status"], page: 1 })
					}
				/>
			</div>

			<div className="overflow-x-auto rounded-lg border bg-background">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead aria-sort={ariaSort(search, "name")}>
								<SortButton
									column="name"
									state={search}
									onSort={(p) => patch(p as Partial<ProductSearch>)}
								>
									Name
								</SortButton>
							</TableHead>
							<TableHead aria-sort={ariaSort(search, "sku")}>
								<SortButton
									column="sku"
									state={search}
									onSort={(p) => patch(p as Partial<ProductSearch>)}
								>
									SKU
								</SortButton>
							</TableHead>
							<TableHead
								aria-sort={ariaSort(search, "unitPriceCents")}
								className="text-right"
							>
								<SortButton
									column="unitPriceCents"
									state={search}
									onSort={(p) => patch(p as Partial<ProductSearch>)}
								>
									Price
								</SortButton>
							</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>
								<span className="sr-only">Actions</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length ? (
							rows.map((p) => (
								<TableRow key={p.id}>
									<TableCell>
										<p className="font-medium">{p.name}</p>
										{p.description ? (
											<p className="max-w-md truncate text-xs text-muted-foreground">
												{p.description}
											</p>
										) : null}
									</TableCell>
									<TableCell className="font-mono text-xs">{p.sku}</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(p.unitPriceCents, currency)}
									</TableCell>
									<TableCell>
										<DocStatusBadge status={p.active ? "active" : "inactive"} />
									</TableCell>
									<TableCell>
										<div className="flex justify-end gap-1">
											{can.update ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={`Edit ${p.name}`}
													onClick={() => {
														setEditing(p);
														setOpen(true);
													}}
												>
													<Pencil />
												</Button>
											) : null}
											{can.delete ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={`Delete ${p.name}`}
													onClick={() => remove(p)}
												>
													<Trash2 />
												</Button>
											) : null}
										</div>
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={5}
									className="h-24 text-center text-muted-foreground"
								>
									No products match these filters.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<ListPagination
				label="Product pages"
				total={total}
				pageCount={pageCount}
				state={search}
				onChange={(p) => patch(p as Partial<ProductSearch>)}
			/>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>
							{editing ? "Edit product" : "New product"}
						</DialogTitle>
						<DialogDescription>
							Price changes apply to new orders only; existing orders keep the
							price they were placed with.
						</DialogDescription>
					</DialogHeader>
					<ProductForm
						key={editing?.id ?? "new"}
						initial={
							editing
								? {
										name: editing.name,
										sku: editing.sku,
										description: editing.description ?? "",
										price: centsToInput(editing.unitPriceCents),
										active: editing.active,
									}
								: EMPTY
						}
						submitLabel={editing ? "Save changes" : "Create product"}
						onCancel={() => setOpen(false)}
						onSave={async (value) => {
							if (editing) {
								await updateProduct({ data: { id: editing.id, ...value } });
								setStatus({ ok: true, message: `${value.name} was updated.` });
							} else {
								await createProduct({ data: value });
								setStatus({ ok: true, message: `${value.name} was added.` });
							}
							setOpen(false);
							await router.invalidate();
						}}
					/>
				</DialogContent>
			</Dialog>
		</div>
	);
}
