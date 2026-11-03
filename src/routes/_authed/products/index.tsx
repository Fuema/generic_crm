import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Lock, Pencil, Plus } from "lucide-react";
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
import { getRecordFields } from "#/modules/fields/fields";
import { formatValue } from "#/modules/fields/values";
import {
	EMPTY_PRODUCT,
	ProductFormDialog,
} from "#/modules/products/components/ProductFormDialog";
import {
	archiveProduct,
	createProduct,
	listProducts,
	type ProductRow,
	restoreProduct,
	updateProduct,
} from "#/modules/products/products";
import {
	type ProductSearch,
	productSearchSchema,
} from "#/modules/products/schema";
import {
	columnLabel,
	ViewToolbar,
} from "#/modules/views/components/ViewToolbar";
import { BUILT_IN_SORT, DEFAULT_COLUMNS } from "#/modules/views/schema";
import { listViews } from "#/modules/views/views";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed guard; listProducts requires product:read
export const Route = createFileRoute("/_authed/products/")({
	validateSearch: productSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [list, fields, views] = await Promise.all([
			listProducts({ data: deps }),
			getRecordFields({ data: { objectKey: "product" } }),
			listViews({ data: { objectKey: "product" } }),
		]);
		return { ...list, fields, views };
	},
	component: ProductsPage,
});

function ProductsPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { rows, total, pageCount, fields, views } = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const can = {
		create: roleCan(access?.role, { product: ["create"] }),
		update: roleCan(access?.role, { product: ["update"] }),
		archive: roleCan(access?.role, { product: ["delete"] }),
	};
	const [dialog, setDialog] = useState<{ row: ProductRow | null } | null>(null);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const columns = search.columns ?? DEFAULT_COLUMNS.product;
	const sortable = new Set([
		...BUILT_IN_SORT.product,
		...fields.fields.map((f) => `custom.${f.key}`),
	]);

	const patch = useCallback(
		(p: Partial<ProductSearch>) => {
			void navigate({ search: (prev) => ({ ...prev, ...p }) });
		},
		[navigate],
	);

	useEffect(() => {
		if (total > 0 && search.page > pageCount) patch({ page: pageCount });
	}, [total, pageCount, search.page, patch]);

	const toggleArchived = async (row: ProductRow) => {
		const archived = Boolean(row.archivedAt);
		if (
			!archived &&
			!window.confirm(m.products_archive_confirm({ name: row.name }))
		)
			return;
		setStatus(null);
		try {
			await (archived ? restoreProduct : archiveProduct)({
				data: { id: row.id },
			});
			setStatus({
				ok: true,
				message: archived
					? m.products_restored({ name: row.name })
					: m.products_archived({ name: row.name }),
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
					onSort={(p) => patch(p as Partial<ProductSearch>)}
				>
					{label}
				</SortButton>
			</TableHead>
		) : (
			<TableHead key={column}>{label}</TableHead>
		);

	const cell = (row: ProductRow, column: string): ReactNode => {
		switch (column) {
			case "sku":
				return <span className="font-mono text-xs">{row.sku}</span>;
			case "unitPriceCents":
				return (
					<span className="tabular-nums">
						{formatMoney(row.unitPriceCents, fields.currency)}
					</span>
				);
			case "description":
				return (
					<span className="line-clamp-2 max-w-72 text-muted-foreground">
						{row.description || m.common_none()}
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
					<h1 className="text-2xl font-bold">{m.products_title()}</h1>
					<p className="text-sm text-muted-foreground">
						{m.products_subtitle()}
					</p>
				</div>
				{can.create ? (
					<Button type="button" onClick={() => setDialog({ row: null })}>
						<Plus /> {m.products_new()}
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
				objectKey="product"
				state={search}
				views={views}
				defs={fields.fields}
				choices={{}}
				onChange={(p) => patch(p as Partial<ProductSearch>)}
				onViewsChanged={() => router.invalidate()}
				onStatus={setStatus}
			/>

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="product-search"
					value={search.q}
					placeholder={m.products_search_placeholder()}
					onSearch={(q) => patch({ q, page: 1 })}
				/>
				<FilterSelect
					id="product-show-filter"
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
							{header("name", m.product_name())}
							{columns.map((c) => header(c, columnLabel(c, fields.fields)))}
							<TableHead>
								<span className="sr-only">{m.list_actions()}</span>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length ? (
							rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell className="font-medium">{row.name}</TableCell>
									{columns.map((c) => (
										<TableCell key={c}>{cell(row, c)}</TableCell>
									))}
									<TableCell>
										<div className="flex justify-end gap-1">
											{can.update && !row.archivedAt ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={m.products_edit_label({ name: row.name })}
													onClick={() => setDialog({ row })}
												>
													<Pencil />
												</Button>
											) : null}
											{can.archive ? (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={
														row.archivedAt
															? m.products_restore_label({ name: row.name })
															: m.products_archive_label({ name: row.name })
													}
													onClick={() => toggleArchived(row)}
												>
													{row.archivedAt ? <ArchiveRestore /> : <Archive />}
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
									{m.products_empty()}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<ListPagination
				label={m.products_pages()}
				total={total}
				pageCount={pageCount}
				state={search}
				onChange={(p) => patch(p as Partial<ProductSearch>)}
			/>

			{dialog ? (
				<ProductFormDialog
					key={dialog.row?.id ?? "new"}
					open
					onOpenChange={(open) => {
						if (!open) setDialog(null);
					}}
					initial={
						dialog.row
							? {
									name: dialog.row.name,
									sku: dialog.row.sku,
									description: dialog.row.description ?? "",
									unitPriceCents: dialog.row.unitPriceCents,
								}
							: EMPTY_PRODUCT
					}
					initialCustom={dialog.row?.custom ?? {}}
					editing={Boolean(dialog.row)}
					fields={fields}
					onSave={async (value) => {
						if (dialog.row)
							await updateProduct({ data: { id: dialog.row.id, ...value } });
						else await createProduct({ data: value });
						setDialog(null);
						setStatus({
							ok: true,
							message: dialog.row
								? m.products_updated({ name: value.name })
								: m.products_added({ name: value.name }),
						});
						await router.invalidate();
					}}
				/>
			) : null}
		</div>
	);
}
