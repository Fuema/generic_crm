import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { invoice, payment } from "#/db/schema";
import { dayToStored } from "#/modules/documents/lines";
import { m } from "#/paraglide/messages.js";
import { type Actor, eventInsert } from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import type { PaymentStatus, RecordPaymentInput } from "./schema";

// Server-only data layer for payments. Every function takes the workspace id
// first and filters by it. Each write locks the invoice row, checks inside the
// batch that the confirmed (and still pending) payments never exceed the
// invoice total, recomputes the invoice's paid_cents and status from the
// confirmed payments, and writes its event: all in one db.batch.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function errorCode(error: unknown) {
	const e = error as { code?: string; cause?: { code?: string } };
	return e?.code ?? e?.cause?.code;
}

async function runBatch(statements: unknown[]) {
	try {
		await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
	} catch (error) {
		if (errorCode(error) === "22012")
			throw clientError(409, m.error_payment_changed());
		throw error;
	}
}

// Statuses an invoice accepts payments in
const PAYABLE = ["issued", "partially_paid", "paid"];

const lockInvoice = (workspaceId: string, invoiceId: string) =>
	db
		.select({ id: invoice.id })
		.from(invoice)
		.where(and(eq(invoice.id, invoiceId), eq(invoice.workspaceId, workspaceId)))
		.for("update");

// Fails the batch unless the condition holds (division by zero)
const guard = (
	workspaceId: string,
	invoiceId: string,
	condition: ReturnType<typeof sql>,
) =>
	db
		.select({ ok: sql<number>`1 / (case when ${condition} then 1 else 0 end)` })
		.from(invoice)
		.where(
			and(eq(invoice.id, invoiceId), eq(invoice.workspaceId, workspaceId)),
		);

const statusList = (statuses: readonly PaymentStatus[]) =>
	sql.join(
		statuses.map((st) => sql`${st}`),
		sql`, `,
	);

const sumOf = (
	workspaceId: string,
	invoiceId: string,
	statuses: readonly PaymentStatus[],
) =>
	sql`(select coalesce(sum(p."amount_cents"), 0) from "payment" p where p."invoice_id" = ${invoiceId} and p."workspace_id" = ${workspaceId} and p."status" in (${statusList(statuses)}))`;

// Recompute paid_cents and the status from the confirmed payments
const recompute = (workspaceId: string, invoiceId: string) => {
	const confirmed = sumOf(workspaceId, invoiceId, ["confirmed"]);
	return db
		.update(invoice)
		.set({
			paidCents: sql`${confirmed}`,
			status: sql`case when ${confirmed} >= "invoice"."total_cents" and "invoice"."total_cents" > 0 then 'paid' when ${confirmed} <= 0 then 'issued' else 'partially_paid' end`,
			paidAt: sql`case when ${confirmed} >= "invoice"."total_cents" then coalesce("invoice"."paid_at", now()) else null end`,
			updatedAt: new Date(),
		})
		.where(
			and(eq(invoice.id, invoiceId), eq(invoice.workspaceId, workspaceId)),
		);
};

async function findInvoice(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(invoice)
		.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_invoice_not_found());
	return row;
}

export async function listPayments(workspaceId: string, invoiceId: string) {
	await findInvoice(workspaceId, invoiceId);
	return db
		.select({
			id: payment.id,
			amountCents: payment.amountCents,
			paidOn: payment.paidOn,
			method: payment.method,
			reference: payment.reference,
			note: payment.note,
			status: payment.status,
			source: payment.source,
			rejectReason: payment.rejectReason,
			decidedAt: payment.decidedAt,
			createdAt: payment.createdAt,
			recordedByName: sql<
				string | null
			>`(select u."name" from "user" u where u."id" = "payment"."recorded_by_id")`,
		})
		.from(payment)
		.where(
			and(
				eq(payment.workspaceId, workspaceId),
				eq(payment.invoiceId, invoiceId),
			),
		)
		.orderBy(asc(payment.paidOn), asc(payment.createdAt));
}

// Records a payment. With `confirm` (owners and admins) it counts at once;
// otherwise it waits as reported. Either way confirmed plus pending payments
// can't exceed the invoice total.
export async function recordPayment(
	workspaceId: string,
	actor: Actor,
	input: RecordPaymentInput,
	confirm: boolean,
) {
	const inv = await findInvoice(workspaceId, input.invoiceId);
	if (inv.archivedAt) throw clientError(409, m.error_record_archived());
	if (!PAYABLE.includes(inv.status))
		throw clientError(409, m.error_payment_invoice_not_issued());
	const id = uuidv7();
	const now = new Date();
	const memberId = actor.type === "member" ? actor.id : null;
	await runBatch([
		lockInvoice(workspaceId, input.invoiceId),
		guard(
			workspaceId,
			input.invoiceId,
			sql`exists (select 1 from "invoice" i where i."id" = ${input.invoiceId} and i."workspace_id" = ${workspaceId} and i."archived_at" is null and i."status" in ('issued', 'partially_paid', 'paid')) and ${sumOf(workspaceId, input.invoiceId, ["confirmed", "reported"])} + ${input.amountCents} <= (select i."total_cents" from "invoice" i where i."id" = ${input.invoiceId} and i."workspace_id" = ${workspaceId})`,
		),
		db.insert(payment).values({
			id,
			workspaceId,
			invoiceId: input.invoiceId,
			amountCents: input.amountCents,
			paidOn: dayToStored(input.paidOn) as Date,
			method: input.method,
			reference: input.reference || null,
			note: input.note || null,
			status: confirm ? "confirmed" : "reported",
			source: "staff",
			recordedById: memberId,
			decidedById: confirm ? memberId : null,
			decidedAt: confirm ? now : null,
		}),
		recompute(workspaceId, input.invoiceId),
		eventInsert(workspaceId, actor, {
			type: confirm ? "invoice.payment_confirmed" : "invoice.payment_recorded",
			subjectType: "invoice",
			subjectId: input.invoiceId,
			payload: {
				paymentId: id,
				amountCents: input.amountCents,
				method: input.method,
			},
		}),
	]).catch(async (error) => {
		// Tell "too much" apart from "changed meanwhile"
		if (error instanceof Response && error.status === 409) {
			const [{ open }] = await db
				.select({
					open: sql<number>`${invoice.totalCents} - ${sumOf(workspaceId, input.invoiceId, ["confirmed", "reported"])}`,
				})
				.from(invoice)
				.where(
					and(
						eq(invoice.id, input.invoiceId),
						eq(invoice.workspaceId, workspaceId),
					),
				);
			if (input.amountCents > Number(open))
				throw clientError(400, m.error_payment_too_much());
		}
		throw error;
	});
	return { id };
}

// confirm: reported -> confirmed (it counts). reject: reported or confirmed ->
// rejected (a confirmed one is reversed and stops counting).
export async function decidePayment(
	workspaceId: string,
	actor: Actor,
	input: { id: string; decision: "confirm" | "reject"; reason: string },
) {
	const [p] = await db
		.select()
		.from(payment)
		.where(and(eq(payment.id, input.id), eq(payment.workspaceId, workspaceId)))
		.limit(1);
	if (!p) throw clientError(404, m.error_payment_not_found());
	const from: PaymentStatus[] =
		input.decision === "confirm" ? ["reported"] : ["reported", "confirmed"];
	if (!from.includes(p.status as PaymentStatus))
		throw clientError(409, m.error_payment_wrong_status());
	const now = new Date();
	const memberId = actor.type === "member" ? actor.id : null;
	await runBatch([
		lockInvoice(workspaceId, p.invoiceId),
		guard(
			workspaceId,
			p.invoiceId,
			sql`exists (select 1 from "payment" pp where pp."id" = ${p.id} and pp."workspace_id" = ${workspaceId} and pp."status" in (${statusList(from)})) and exists (select 1 from "invoice" i where i."id" = ${p.invoiceId} and i."workspace_id" = ${workspaceId} and i."archived_at" is null and i."status" in ('issued', 'partially_paid', 'paid'))`,
		),
		db
			.update(payment)
			.set({
				status: input.decision === "confirm" ? "confirmed" : "rejected",
				decidedById: memberId,
				decidedAt: now,
				rejectReason: input.decision === "reject" ? input.reason || null : null,
				updatedAt: now,
			})
			.where(and(eq(payment.id, p.id), eq(payment.workspaceId, workspaceId))),
		recompute(workspaceId, p.invoiceId),
		eventInsert(workspaceId, actor, {
			type:
				input.decision === "confirm"
					? "invoice.payment_confirmed"
					: "invoice.payment_rejected",
			subjectType: "invoice",
			subjectId: p.invoiceId,
			payload: {
				paymentId: p.id,
				amountCents: p.amountCents,
				...(input.decision === "reject"
					? { reason: input.reason || null }
					: {}),
			},
		}),
	]);
	return { id: p.id, invoiceId: p.invoiceId };
}
