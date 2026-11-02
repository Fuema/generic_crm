import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, FileText } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/Customers/CustomerFormDialog";
import { DocStatusBadge, formatDate } from "#/components/data/ListControls";
import { OrderEditor } from "#/components/Orders/OrderEditor";
import { Button, buttonVariants } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { getBillingSettings } from "#/lib/billing";
import { createInvoiceFromOrder } from "#/lib/invoices";
import {
	bpToPercent,
	formatMoney,
	invoiceNumberLabel,
	orderNumberLabel,
} from "#/lib/money";
import {
	deleteOrder,
	getOrder,
	listOrderCustomers,
	setOrderStatus,
	updateOrder,
} from "#/lib/orders";
import { roleCan } from "#/lib/permissions";
import { listActiveProducts } from "#/lib/products";
import type { OrderStatus } from "#/lib/schema";

export const Route = createFileRoute("/_authed/orders/$orderId")({
	loader: async ({ params, context }) => {
		const detail = await getOrder({ data: { id: params.orderId } });
		// The editor's options are only needed for a draft the user may edit
		const editable =
			detail.order.status === "draft" &&
			roleCan(context.access?.role, { order: ["update"] });
		const editor = editable
			? await Promise.all([
					listOrderCustomers(),
					listActiveProducts(),
					getBillingSettings(),
				]).then(([customers, products, settings]) => ({
					customers,
					products,
					settings,
				}))
			: null;
		return { ...detail, editor };
	},
	component: OrderPage,
});

function OrderPage() {
	const router = useRouter();
	const { order, customer, lines, invoice, editor } = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const role = access?.role;
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const [busy, setBusy] = useState(false);

	const run = async (action: () => Promise<unknown>, success: string) => {
		setBusy(true);
		setStatus(null);
		try {
			await action();
			setStatus({ ok: true, message: success });
			await router.invalidate();
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		} finally {
			setBusy(false);
		}
	};
	const changeStatus = (next: OrderStatus, success: string) =>
		run(
			() => setOrderStatus({ data: { id: order.id, status: next } }),
			success,
		);

	const can = {
		update: roleCan(role, { order: ["update"] }),
		delete: roleCan(role, { order: ["delete"] }),
		invoice: roleCan(role, { invoice: ["create"] }),
	};
	const s = order.status as OrderStatus;
	const label = orderNumberLabel(order.number);

	return (
		<div className="mx-auto max-w-4xl space-y-4 p-6">
			<Link
				to="/orders"
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
			>
				<ArrowLeft className="size-4" /> Orders
			</Link>

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<h1 className="text-2xl font-bold">{label}</h1>
					<DocStatusBadge status={order.status} />
				</div>
				<div className="flex flex-wrap gap-2">
					{can.update && s === "draft" ? (
						<Button
							type="button"
							disabled={busy}
							onClick={() => changeStatus("confirmed", `${label} confirmed.`)}
						>
							Confirm order
						</Button>
					) : null}
					{can.update && s === "confirmed" ? (
						<Button
							type="button"
							disabled={busy}
							onClick={() =>
								changeStatus("fulfilled", `${label} marked as fulfilled.`)
							}
						>
							Mark fulfilled
						</Button>
					) : null}
					{can.invoice &&
					(s === "confirmed" || s === "fulfilled") &&
					!invoice ? (
						<Button
							type="button"
							variant="outline"
							disabled={busy}
							onClick={() =>
								run(async () => {
									const { id } = await createInvoiceFromOrder({
										data: { orderId: order.id },
									});
									await router.navigate({
										to: "/invoices/$invoiceId",
										params: { invoiceId: id },
									});
								}, "Draft invoice created.")
							}
						>
							<FileText /> Create invoice
						</Button>
					) : null}
					{invoice ? (
						<Link
							to="/invoices/$invoiceId"
							params={{ invoiceId: invoice.id }}
							className={buttonVariants({ variant: "outline" })}
						>
							<FileText /> {invoiceNumberLabel(invoice.year, invoice.number)} (
							{invoice.status})
						</Link>
					) : null}
					{can.update && (s === "draft" || s === "confirmed") ? (
						<Button
							type="button"
							variant="outline"
							disabled={busy}
							onClick={() => {
								if (window.confirm(`Cancel ${label}?`))
									void changeStatus("cancelled", `${label} cancelled.`);
							}}
						>
							Cancel order
						</Button>
					) : null}
					{can.delete && (s === "draft" || s === "cancelled") && !invoice ? (
						<Button
							type="button"
							variant="destructive"
							disabled={busy}
							onClick={() => {
								if (!window.confirm(`Delete ${label}? This can't be undone.`))
									return;
								void run(async () => {
									await deleteOrder({ data: { id: order.id } });
									await router.navigate({ to: "/orders" });
								}, `${label} deleted.`);
							}}
						>
							Delete
						</Button>
					) : null}
				</div>
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			{editor ? (
				<Card>
					<CardHeader>
						<CardTitle>Edit draft</CardTitle>
						<CardDescription>
							Confirm the order when it's ready; confirmed orders can't be
							edited.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<OrderEditor
							customers={editor.customers}
							products={editor.products}
							currency={order.currency}
							initial={{
								customerId: order.customerId,
								taxRate: bpToPercent(order.taxRateBp),
								notes: order.notes ?? "",
								lines: lines
									.filter((l) => l.productId)
									.map((l) => ({
										productId: l.productId as string,
										quantity: l.quantity,
									})),
							}}
							submitLabel="Save draft"
							onSave={async (value) => {
								await updateOrder({ data: { id: order.id, ...value } });
								setStatus({ ok: true, message: "Draft saved." });
								await router.invalidate();
							}}
						/>
					</CardContent>
				</Card>
			) : (
				<Card>
					<CardHeader>
						<CardTitle>{customer.name}</CardTitle>
						<CardDescription>
							{customer.email}
							{customer.company ? ` · ${customer.company}` : ""} · ordered{" "}
							{formatDate(order.orderDate)}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead className="border-b text-left text-muted-foreground">
									<tr>
										<th className="py-2 font-medium">Item</th>
										<th className="py-2 text-right font-medium">Qty</th>
										<th className="py-2 text-right font-medium">Unit price</th>
										<th className="py-2 text-right font-medium">Total</th>
									</tr>
								</thead>
								<tbody className="tabular-nums">
									{lines.map((l) => (
										<tr key={l.id} className="border-b">
											<td className="py-2">
												{l.description}
												{l.sku ? (
													<span className="ml-2 font-mono text-xs text-muted-foreground">
														{l.sku}
													</span>
												) : null}
											</td>
											<td className="py-2 text-right">{l.quantity}</td>
											<td className="py-2 text-right">
												{formatMoney(l.unitPriceCents, order.currency)}
											</td>
											<td className="py-2 text-right">
												{formatMoney(l.lineTotalCents, order.currency)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<dl className="ml-auto max-w-xs space-y-1 text-sm tabular-nums">
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Subtotal</dt>
								<dd>{formatMoney(order.subtotalCents, order.currency)}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">
									Tax ({bpToPercent(order.taxRateBp)}%)
								</dt>
								<dd>{formatMoney(order.taxCents, order.currency)}</dd>
							</div>
							<div className="flex justify-between border-t pt-1 text-base font-semibold">
								<dt>Total</dt>
								<dd>{formatMoney(order.totalCents, order.currency)}</dd>
							</div>
						</dl>
						{order.notes ? (
							<p className="text-sm whitespace-pre-line text-muted-foreground">
								{order.notes}
							</p>
						) : null}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
