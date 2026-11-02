import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/Customers/CustomerFormDialog";
import {
	DocStatusBadge,
	formatDate,
	invoiceDisplayStatus,
} from "#/components/data/ListControls";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { countryName } from "#/lib/countries";
import {
	deleteInvoice,
	getInvoice,
	issueInvoice,
	markInvoicePaid,
	updateInvoiceNotes,
	voidInvoice,
} from "#/lib/invoices";
import {
	bpToPercent,
	formatMoney,
	invoiceNumberLabel,
	orderNumberLabel,
} from "#/lib/money";
import { roleCan } from "#/lib/permissions";

export const Route = createFileRoute("/_authed/invoices/$invoiceId")({
	loader: ({ params }) => getInvoice({ data: { id: params.invoiceId } }),
	component: InvoicePage,
});

function InvoicePage() {
	const router = useRouter();
	const {
		invoice: inv,
		customer,
		lines,
		order,
		seller,
	} = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const role = access?.role;
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const [busy, setBusy] = useState(false);
	const [notes, setNotes] = useState(inv.notes ?? "");

	const label = invoiceNumberLabel(inv.year, inv.number);
	const display = invoiceDisplayStatus(inv.status, inv.dueDate);
	const can = {
		update: roleCan(role, { invoice: ["update"] }),
		issue: roleCan(role, { invoice: ["issue"] }),
		pay: roleCan(role, { invoice: ["pay"] }),
		void: roleCan(role, { invoice: ["void"] }),
		delete: roleCan(role, { invoice: ["delete"] }),
	};

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
	const id = { data: { id: inv.id } };

	return (
		<div className="mx-auto max-w-4xl space-y-4 p-6 print:max-w-none print:p-0">
			<div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
				<Link
					to="/invoices"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
				>
					<ArrowLeft className="size-4" /> Invoices
				</Link>
				<div className="flex flex-wrap gap-2">
					{can.issue && inv.status === "draft" ? (
						<Button
							type="button"
							disabled={busy}
							onClick={() => {
								if (
									window.confirm(
										"Issue this invoice? It gets its final number and can no longer be edited.",
									)
								)
									void run(() => issueInvoice(id), "Invoice issued.");
							}}
						>
							Issue invoice
						</Button>
					) : null}
					{can.pay && inv.status === "issued" ? (
						<Button
							type="button"
							disabled={busy}
							onClick={() =>
								run(() => markInvoicePaid(id), "Payment recorded.")
							}
						>
							Mark as paid
						</Button>
					) : null}
					<Button
						type="button"
						variant="outline"
						onClick={() => window.print()}
					>
						<Printer /> Print / Save as PDF
					</Button>
					{can.void && (inv.status === "draft" || inv.status === "issued") ? (
						<Button
							type="button"
							variant="outline"
							disabled={busy}
							onClick={() => {
								if (
									window.confirm(
										`Void ${label}? It stays on record but no longer counts as owed.`,
									)
								)
									void run(() => voidInvoice(id), "Invoice voided.");
							}}
						>
							Void
						</Button>
					) : null}
					{can.delete && inv.status === "draft" ? (
						<Button
							type="button"
							variant="destructive"
							disabled={busy}
							onClick={() => {
								if (!window.confirm("Delete this draft invoice?")) return;
								void run(async () => {
									await deleteInvoice(id);
									await router.navigate({
										to: "/orders/$orderId",
										params: { orderId: order.id },
									});
								}, "Draft deleted.");
							}}
						>
							Delete draft
						</Button>
					) : null}
				</div>
			</div>

			<div className="print:hidden">
				<FormAlert
					message={status?.message ?? null}
					variant={status?.ok ? "success" : "destructive"}
				/>
				{inv.status === "draft" && !can.issue ? (
					<p className="mt-2 text-sm text-muted-foreground">
						An owner or admin needs to issue this draft.
					</p>
				) : null}
			</div>

			{/* The document itself: what prints */}
			<article className="relative space-y-8 rounded-lg border bg-card p-8 print:border-0 print:p-0">
				{display === "void" || display === "draft" ? (
					<p
						className="pointer-events-none absolute inset-0 flex items-center justify-center text-7xl font-bold tracking-widest text-muted-foreground/15 uppercase select-none"
						aria-hidden="true"
					>
						{display}
					</p>
				) : null}
				<header className="flex flex-wrap items-start justify-between gap-6">
					<div>
						<p className="text-sm text-muted-foreground">From</p>
						<p className="text-lg font-semibold">{seller?.name}</p>
					</div>
					<div className="text-right">
						<h1 className="text-2xl font-bold">Invoice {label}</h1>
						<div className="mt-1 flex justify-end print:hidden">
							<DocStatusBadge status={display} />
						</div>
					</div>
				</header>

				<div className="grid gap-6 sm:grid-cols-2">
					<div>
						<p className="text-sm text-muted-foreground">Bill to</p>
						<p className="font-medium">{customer.name}</p>
						{customer.company ? <p>{customer.company}</p> : null}
						<p>{customer.email}</p>
						{customer.city || customer.country ? (
							<p>
								{[customer.city, countryName(customer.country)]
									.filter(Boolean)
									.join(", ")}
							</p>
						) : null}
					</div>
					<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:justify-self-end">
						<dt className="text-muted-foreground">Issue date</dt>
						<dd>{formatDate(inv.issueDate)}</dd>
						<dt className="text-muted-foreground">Due date</dt>
						<dd>{formatDate(inv.dueDate)}</dd>
						<dt className="text-muted-foreground">Order</dt>
						<dd>
							<Link
								to="/orders/$orderId"
								params={{ orderId: order.id }}
								className="hover:underline"
							>
								{orderNumberLabel(order.number)}
							</Link>
						</dd>
						{inv.paidAt ? (
							<>
								<dt className="text-muted-foreground">Paid</dt>
								<dd>{formatDate(inv.paidAt)}</dd>
							</>
						) : null}
					</dl>
				</div>

				<table className="w-full text-sm">
					<thead className="border-b text-left text-muted-foreground">
						<tr>
							<th className="py-2 font-medium">Item</th>
							<th className="py-2 text-right font-medium">Qty</th>
							<th className="py-2 text-right font-medium">Unit price</th>
							<th className="py-2 text-right font-medium">Amount</th>
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
									{formatMoney(l.unitPriceCents, inv.currency)}
								</td>
								<td className="py-2 text-right">
									{formatMoney(l.lineTotalCents, inv.currency)}
								</td>
							</tr>
						))}
					</tbody>
				</table>

				<dl className="ml-auto max-w-xs space-y-1 text-sm tabular-nums">
					<div className="flex justify-between">
						<dt className="text-muted-foreground">Subtotal</dt>
						<dd>{formatMoney(inv.subtotalCents, inv.currency)}</dd>
					</div>
					<div className="flex justify-between">
						<dt className="text-muted-foreground">
							Tax ({bpToPercent(inv.taxRateBp)}%)
						</dt>
						<dd>{formatMoney(inv.taxCents, inv.currency)}</dd>
					</div>
					<div className="flex justify-between border-t pt-1 text-lg font-semibold">
						<dt>Total due</dt>
						<dd>
							{formatMoney(
								inv.status === "paid" || inv.status === "void"
									? 0
									: inv.totalCents,
								inv.currency,
							)}
						</dd>
					</div>
					{inv.status === "paid" ? (
						<p className="text-right text-xs text-muted-foreground">
							Paid in full: {formatMoney(inv.totalCents, inv.currency)}
						</p>
					) : null}
				</dl>

				{inv.status === "draft" && can.update ? (
					<div className="space-y-2 print:hidden">
						<Label htmlFor="invoice-notes">
							Notes (printed on the invoice)
						</Label>
						<Textarea
							id="invoice-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							maxLength={1000}
							rows={3}
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={busy || notes === (inv.notes ?? "")}
							onClick={() =>
								run(
									() => updateInvoiceNotes({ data: { id: inv.id, notes } }),
									"Notes saved.",
								)
							}
						>
							Save notes
						</Button>
					</div>
				) : inv.notes ? (
					<p className="text-sm whitespace-pre-line text-muted-foreground">
						{inv.notes}
					</p>
				) : null}
			</article>
		</div>
	);
}
