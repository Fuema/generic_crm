import { Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
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
import { Textarea } from "#/components/ui/textarea";
import { centsToInput, formatMoney, parseMoneyToCents } from "#/lib/money";
import { OptionSelect } from "#/modules/contacts/components/fields";
import { formatDay } from "#/modules/deals/components/DealBits";
import { DocumentStatusBadge } from "#/modules/documents/components/DocumentBits";
import { m } from "#/paraglide/messages.js";
import { decidePayment, type PaymentRow, recordPayment } from "../payments";
import {
	PAYMENT_METHOD_LABELS,
	PAYMENT_METHODS,
	PAYMENT_STATUS_LABELS,
	type PaymentMethod,
	type PaymentStatus,
	recordPaymentSchema,
} from "../schema";

// Today in the reader's own time zone, as "YYYY-MM-DD"
const today = () => {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function paymentTone(status: string) {
	return status === "confirmed"
		? ("good" as const)
		: status === "rejected"
			? ("bad" as const)
			: ("active" as const);
}

// An invoice's payments: the balance, the list, "Record payment", and confirm
// or reject for those who may (invoice:pay)
export function PaymentsCard({
	invoiceId,
	currency,
	totalCents,
	paidCents,
	payments,
	canRecord,
	canDecide,
	onChanged,
}: {
	invoiceId: string;
	currency: string;
	totalCents: number;
	paidCents: number;
	payments: PaymentRow[];
	canRecord: boolean;
	canDecide: boolean;
	onChanged: (message: string) => Promise<void>;
}) {
	const money = (cents: number) => formatMoney(cents, currency);
	const pending = payments
		.filter((p) => p.status === "reported")
		.reduce((n, p) => n + p.amountCents, 0);
	const balance = totalCents - paidCents;
	const open = Math.max(0, balance - pending);
	const [recording, setRecording] = useState(false);
	const [amount, setAmount] = useState("");
	const [paidOn, setPaidOn] = useState(today());
	const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
	const [reference, setReference] = useState("");
	const [note, setNote] = useState("");
	const [rejecting, setRejecting] = useState<PaymentRow | null>(null);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const run = async (action: () => Promise<unknown>, message: string) => {
		setBusy(true);
		setError(null);
		try {
			await action();
			await onChanged(message);
			return true;
		} catch (e) {
			setError(await serverErrorMessage(e));
			return false;
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card className="print:hidden">
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
				<CardTitle>{m.payments_title()}</CardTitle>
				{canRecord && open > 0 ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							setAmount(centsToInput(open));
							setPaidOn(today());
							setMethod("bank_transfer");
							setReference("");
							setNote("");
							setError(null);
							setRecording(true);
						}}
					>
						<Plus /> {m.payments_record()}
					</Button>
				) : null}
			</CardHeader>
			<CardContent className="space-y-4">
				<FormAlert message={error} />
				<dl className="grid gap-2 text-sm sm:grid-cols-3">
					<div>
						<dt className="text-xs text-muted-foreground">
							{m.payments_paid()}
						</dt>
						<dd className="tabular-nums">{money(paidCents)}</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">
							{m.payments_pending()}
						</dt>
						<dd className="tabular-nums">{money(pending)}</dd>
					</div>
					<div>
						<dt className="text-xs text-muted-foreground">
							{m.payments_balance()}
						</dt>
						<dd className="font-semibold tabular-nums">{money(balance)}</dd>
					</div>
				</dl>
				{payments.length ? (
					<ul className="divide-y">
						{payments.map((p) => (
							<li
								key={p.id}
								className="flex flex-wrap items-center gap-2 py-2 text-sm"
							>
								<span className="min-w-24">{formatDay(p.paidOn)}</span>
								<span className="font-medium tabular-nums">
									{money(p.amountCents)}
								</span>
								<span className="text-muted-foreground">
									{PAYMENT_METHOD_LABELS[p.method as PaymentMethod]?.() ??
										p.method}
									{p.reference ? ` · ${p.reference}` : ""}
								</span>
								<span className="flex-1" />
								<DocumentStatusBadge
									label={
										PAYMENT_STATUS_LABELS[p.status as PaymentStatus]?.() ??
										p.status
									}
									tone={paymentTone(p.status)}
								/>
								{canDecide && p.status === "reported" ? (
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={busy}
										aria-label={m.payments_confirm_label({
											amount: money(p.amountCents),
										})}
										onClick={() =>
											run(
												() =>
													decidePayment({
														data: { id: p.id, decision: "confirm", reason: "" },
													}),
												m.payments_confirmed_notice(),
											)
										}
									>
										<Check /> {m.payments_confirm()}
									</Button>
								) : null}
								{canDecide && p.status !== "rejected" ? (
									<Button
										type="button"
										size="sm"
										variant="ghost"
										disabled={busy}
										aria-label={m.payments_reject_label({
											amount: money(p.amountCents),
										})}
										onClick={() => {
											setReason("");
											setRejecting(p);
										}}
									>
										<X />{" "}
										{p.status === "confirmed"
											? m.payments_reverse()
											: m.payments_reject()}
									</Button>
								) : null}
								{p.note || p.rejectReason ? (
									<p className="w-full text-xs text-muted-foreground">
										{[p.note, p.rejectReason].filter(Boolean).join(" · ")}
									</p>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">{m.payments_none()}</p>
				)}
			</CardContent>

			<Dialog open={recording} onOpenChange={setRecording}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{m.payments_record()}</DialogTitle>
						<DialogDescription>
							{canDecide
								? m.payments_record_confirmed()
								: m.payments_record_reported()}
						</DialogDescription>
					</DialogHeader>
					<form
						noValidate
						className="space-y-4"
						onSubmit={async (e) => {
							e.preventDefault();
							const cents = parseMoneyToCents(amount);
							const parsed = recordPaymentSchema.safeParse({
								invoiceId,
								amountCents: cents ?? 0,
								paidOn,
								method,
								reference,
								note,
							});
							if (cents === null || !parsed.success) {
								setError(
									cents === null
										? m.validation_payment_amount()
										: (parsed.error?.issues[0]?.message ?? m.error_generic()),
								);
								return;
							}
							if (cents > open) {
								setError(m.error_payment_too_much());
								return;
							}
							const ok = await run(
								() => recordPayment({ data: parsed.data }),
								canDecide
									? m.payments_recorded_confirmed_notice()
									: m.payments_recorded_reported_notice(),
							);
							if (ok) setRecording(false);
						}}
					>
						<FormAlert message={error} />
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="payment-amount">
									{m.payments_amount({ currency })}
								</Label>
								<Input
									id="payment-amount"
									inputMode="decimal"
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
								/>
								<p className="text-xs text-muted-foreground">
									{m.payments_open({ amount: money(open) })}
								</p>
							</div>
							<div className="space-y-2">
								<Label htmlFor="payment-date">{m.payments_date()}</Label>
								<Input
									id="payment-date"
									type="date"
									max={today()}
									value={paidOn}
									onChange={(e) => setPaidOn(e.target.value)}
								/>
							</div>
							<OptionSelect
								id="payment-method"
								label={m.payments_method()}
								value={method}
								onChange={(v) => setMethod(v as PaymentMethod)}
								options={PAYMENT_METHODS.map((pm) => ({
									value: pm,
									label: PAYMENT_METHOD_LABELS[pm](),
								}))}
							/>
							<div className="space-y-2">
								<Label htmlFor="payment-reference">
									{m.payments_reference()}
								</Label>
								<Input
									id="payment-reference"
									value={reference}
									maxLength={100}
									onChange={(e) => setReference(e.target.value)}
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="payment-note">{m.payments_note()}</Label>
							<Textarea
								id="payment-note"
								value={note}
								maxLength={500}
								onChange={(e) => setNote(e.target.value)}
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setRecording(false)}
							>
								{m.common_cancel()}
							</Button>
							<Button type="submit" disabled={busy}>
								{m.payments_record()}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog
				open={Boolean(rejecting)}
				onOpenChange={(open) => {
					if (!open) setRejecting(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{rejecting?.status === "confirmed"
								? m.payments_reverse_title()
								: m.payments_reject_title()}
						</DialogTitle>
						<DialogDescription>
							{m.payments_reject_description()}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="payment-reject-reason">
							{m.quote_decline_reason()}
						</Label>
						<Textarea
							id="payment-reject-reason"
							value={reason}
							maxLength={500}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setRejecting(null)}
						>
							{m.common_cancel()}
						</Button>
						<Button
							type="button"
							disabled={busy}
							onClick={async () => {
								if (!rejecting) return;
								const ok = await run(
									() =>
										decidePayment({
											data: { id: rejecting.id, decision: "reject", reason },
										}),
									m.payments_rejected_notice(),
								);
								if (ok) setRejecting(null);
							}}
						>
							{rejecting?.status === "confirmed"
								? m.payments_reverse()
								: m.payments_reject()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
