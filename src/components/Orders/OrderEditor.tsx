import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/Customers/CustomerFormDialog";
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
import { Textarea } from "#/components/ui/textarea";
import { computeTotals, formatMoney, parsePercentToBp } from "#/lib/money";
import type { OrderCustomerOption } from "#/lib/orders";
import type { ProductOption } from "#/lib/products";
import { type OrderInput, orderInputSchema } from "#/lib/schema";

type Line = { key: string; productId: string; quantity: string };

export type OrderEditorValue = {
	customerId: string;
	taxRate: string;
	notes: string;
	lines: { productId: string; quantity: number }[];
};

function newLine(productId = "", quantity = "1"): Line {
	return { key: crypto.randomUUID(), productId, quantity };
}

// Creates an order or edits a draft. Prices shown here are previews from the
// catalog; the server prices every line again when saving.
export function OrderEditor({
	customers,
	products,
	currency,
	initial,
	submitLabel,
	onSave,
	onCancel,
}: {
	customers: OrderCustomerOption[];
	products: ProductOption[];
	currency: string;
	initial: OrderEditorValue;
	submitLabel: string;
	onSave: (value: OrderInput) => Promise<void>;
	onCancel?: () => void;
}) {
	const [customerId, setCustomerId] = useState(initial.customerId);
	const [taxRate, setTaxRate] = useState(initial.taxRate);
	const [notes, setNotes] = useState(initial.notes);
	const [lines, setLines] = useState<Line[]>(
		initial.lines.length
			? initial.lines.map((l) => newLine(l.productId, String(l.quantity)))
			: [newLine()],
	);
	const [errors, setErrors] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);

	const byId = new Map(products.map((p) => [p.id, p]));
	const priced = lines.map((l) => ({
		quantity: Math.max(0, Math.trunc(Number(l.quantity)) || 0),
		unitPriceCents: byId.get(l.productId)?.unitPriceCents ?? 0,
	}));
	const totals = computeTotals(priced, parsePercentToBp(taxRate) ?? 0);

	const update = (key: string, patch: Partial<Line>) =>
		setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

	const submit = async () => {
		const parsed = orderInputSchema.safeParse({
			customerId,
			taxRate,
			notes,
			lines: lines.map((l) => ({
				productId: l.productId,
				quantity: l.quantity,
			})),
		});
		if (!parsed.success) {
			setErrors([...new Set(parsed.error.issues.map((i) => i.message))]);
			return;
		}
		setErrors([]);
		setSaving(true);
		try {
			await onSave(parsed.data);
		} catch (e) {
			setErrors([await serverErrorMessage(e)]);
		} finally {
			setSaving(false);
		}
	};

	if (!products.length || !customers.length) {
		return (
			<FormAlert
				message={
					!customers.length
						? "Add a customer first: orders need a lead or active customer."
						: "Add an active product first: orders are built from the catalog."
				}
			/>
		);
	}

	return (
		<form
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
			className="space-y-6"
		>
			{errors.length ? (
				<div
					role="alert"
					className="rounded-lg border border-destructive/50 p-3 text-sm text-destructive"
				>
					<ul className="list-inside list-disc space-y-1">
						{errors.map((m) => (
							<li key={m}>{m}</li>
						))}
					</ul>
				</div>
			) : null}

			<div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
				<div className="space-y-2">
					<Label htmlFor="order-customer">Customer *</Label>
					<Select value={customerId} onValueChange={setCustomerId}>
						<SelectTrigger id="order-customer" className="w-full">
							<SelectValue placeholder="Choose a customer" />
						</SelectTrigger>
						<SelectContent className="max-h-72">
							{customers.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name} · {c.email}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-2">
					<Label htmlFor="order-tax">Tax rate (%)</Label>
					<Input
						id="order-tax"
						value={taxRate}
						onChange={(e) => setTaxRate(e.target.value)}
						inputMode="decimal"
						maxLength={6}
						placeholder="8.25"
					/>
				</div>
			</div>

			<fieldset className="space-y-2">
				<legend className="text-sm font-medium">Lines *</legend>
				<div className="overflow-x-auto rounded-lg border">
					<table className="w-full text-sm">
						<thead className="border-b bg-muted/40 text-left text-muted-foreground">
							<tr>
								<th className="p-2 font-medium">Product</th>
								<th className="w-24 p-2 font-medium">Qty</th>
								<th className="w-28 p-2 text-right font-medium">Unit price</th>
								<th className="w-28 p-2 text-right font-medium">Total</th>
								<th className="w-10 p-2">
									<span className="sr-only">Remove</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{lines.map((l, i) => {
								const p = byId.get(l.productId);
								return (
									<tr key={l.key} className="border-b last:border-0">
										<td className="p-2">
											<Select
												value={l.productId}
												onValueChange={(v) => update(l.key, { productId: v })}
											>
												<SelectTrigger
													className="w-full min-w-48"
													aria-label={`Product for line ${i + 1}`}
												>
													<SelectValue placeholder="Choose a product" />
												</SelectTrigger>
												<SelectContent className="max-h-72">
													{products.map((opt) => (
														<SelectItem
															key={opt.id}
															value={opt.id}
															// A product can only appear on one line
															disabled={
																opt.id !== l.productId &&
																lines.some((x) => x.productId === opt.id)
															}
														>
															{opt.name} ({opt.sku})
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</td>
										<td className="p-2">
											<Input
												type="number"
												min={1}
												max={100000}
												step={1}
												value={l.quantity}
												onChange={(e) =>
													update(l.key, { quantity: e.target.value })
												}
												aria-label={`Quantity for line ${i + 1}`}
											/>
										</td>
										<td className="p-2 text-right tabular-nums">
											{p ? formatMoney(p.unitPriceCents, currency) : "—"}
										</td>
										<td className="p-2 text-right tabular-nums">
											{p ? formatMoney(totals.lineTotals[i], currency) : "—"}
										</td>
										<td className="p-2">
											<Button
												type="button"
												variant="ghost"
												size="icon"
												disabled={lines.length === 1}
												onClick={() =>
													setLines((ls) => ls.filter((x) => x.key !== l.key))
												}
												aria-label={`Remove line ${i + 1}`}
											>
												<Trash2 />
											</Button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={lines.length >= 100 || lines.length >= products.length}
					onClick={() => setLines((ls) => [...ls, newLine()])}
				>
					<Plus /> Add line
				</Button>
			</fieldset>

			<div className="grid gap-6 sm:grid-cols-[1fr_16rem]">
				<div className="space-y-2">
					<Label htmlFor="order-notes">Notes</Label>
					<Textarea
						id="order-notes"
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						maxLength={1000}
						rows={3}
					/>
				</div>
				<dl
					className="space-y-1 self-end text-sm tabular-nums"
					aria-live="polite"
				>
					<div className="flex justify-between">
						<dt className="text-muted-foreground">Subtotal</dt>
						<dd>{formatMoney(totals.subtotalCents, currency)}</dd>
					</div>
					<div className="flex justify-between">
						<dt className="text-muted-foreground">Tax ({taxRate || "0"}%)</dt>
						<dd>{formatMoney(totals.taxCents, currency)}</dd>
					</div>
					<div className="flex justify-between border-t pt-1 text-base font-semibold">
						<dt>Total</dt>
						<dd>{formatMoney(totals.totalCents, currency)}</dd>
					</div>
				</dl>
			</div>

			<div className="flex gap-2">
				<Button type="submit" disabled={saving}>
					{saving ? "Saving..." : submitLabel}
				</Button>
				{onCancel ? (
					<Button type="button" variant="ghost" onClick={onCancel}>
						Cancel
					</Button>
				) : null}
			</div>
		</form>
	);
}
