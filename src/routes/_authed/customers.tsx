import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Lock, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import {
	CustomerFormDialog,
	serverErrorMessage,
} from "#/components/Customers/CustomerFormDialog";
import { CustomersPagination } from "#/components/Customers/CustomersPagination";
import { CustomersTable } from "#/components/Customers/CustomersTable";
import { CustomersToolbar } from "#/components/Customers/CustomersToolbar";
import { Button } from "#/components/ui/button";
import {
	type CustomerRow,
	createCustomer,
	deleteCustomer,
	listCustomers,
	updateCustomer,
} from "#/lib/customers";
import { type CustomerSearch, customerSearchSchema } from "#/lib/schema";

// Protected by the _authed layout guard; listCustomers itself requires customer:read.
// The table state (page, size, search, filters, sort) lives in the URL, so every
// view can be bookmarked or shared, and the back button works as expected.
export const Route = createFileRoute("/_authed/customers")({
	validateSearch: customerSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => listCustomers({ data: deps }),
	component: CustomersPage,
});

function CustomersPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { rows, total, pageCount } = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const can = access?.can;

	const [editing, setEditing] = useState<CustomerRow | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);

	const onSearchChange = useCallback(
		(patch: Partial<CustomerSearch>) => {
			void navigate({ search: (prev) => ({ ...prev, ...patch }) });
		},
		[navigate],
	);

	// After deleting the last row of the last page, step back to a page that exists
	useEffect(() => {
		if (total > 0 && search.page > pageCount)
			onSearchChange({ page: pageCount });
	}, [total, pageCount, search.page, onSearchChange]);

	const openCreate = () => {
		setEditing(null);
		setDialogOpen(true);
	};
	const onEdit = useCallback((row: CustomerRow) => {
		setEditing(row);
		setDialogOpen(true);
	}, []);
	const onDelete = useCallback(
		async (row: CustomerRow) => {
			if (!window.confirm(`Delete ${row.name}? This can't be undone.`)) return;
			setStatus(null);
			try {
				await deleteCustomer({ data: { id: row.id } });
				setStatus({ ok: true, message: `${row.name} was deleted.` });
				await router.invalidate();
			} catch (e) {
				setStatus({ ok: false, message: await serverErrorMessage(e) });
			}
		},
		[router],
	);

	return (
		<div className="mx-auto max-w-7xl space-y-6 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">Customers</h1>
					<p className="text-sm text-muted-foreground">
						Customers in {access?.workspace?.name ?? "this workspace"}.
					</p>
				</div>
				{can?.createCustomer ? (
					<Button type="button" onClick={openCreate}>
						<Plus /> New customer
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

			<CustomersToolbar search={search} onSearchChange={onSearchChange} />
			<CustomersTable
				rows={rows}
				total={total}
				pageCount={pageCount}
				search={search}
				onSearchChange={onSearchChange}
				canUpdate={Boolean(can?.updateCustomer)}
				canDelete={Boolean(can?.deleteCustomer)}
				onEdit={onEdit}
				onDelete={onDelete}
			/>
			<CustomersPagination
				total={total}
				pageCount={pageCount}
				search={search}
				onSearchChange={onSearchChange}
			/>

			<CustomerFormDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				customer={editing}
				onSave={async (value) => {
					if (editing) {
						await updateCustomer({ data: { id: editing.id, ...value } });
						setStatus({ ok: true, message: `${value.name} was updated.` });
					} else {
						await createCustomer({ data: value });
						setStatus({ ok: true, message: `${value.name} was added.` });
					}
					setDialogOpen(false);
					await router.invalidate();
				}}
			/>
		</div>
	);
}
