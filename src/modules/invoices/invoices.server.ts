import {
	and,
	asc,
	count,
	desc,
	eq,
	isNotNull,
	isNull,
	or,
	type SQL,
	sql,
	sum,
} from "drizzle-orm";
import { db } from "#/db/index";
import {
	company,
	contact,
	deal,
	event,
	invoice,
	invoiceLine,
	orderLine,
	organization,
	payment,
	salesOrder,
	workspaceCounter,
} from "#/db/schema";
import { getWorkspaceSettings } from "#/lib/billing.server";
import { sendEmail } from "#/lib/email";
import { assertWorkspaceRefs } from "#/lib/workspace-refs.server";
import { documentEmail } from "#/modules/documents/document-email.server";
import { documentTotals, utcDay } from "#/modules/documents/lines";
import { assertLineProducts } from "#/modules/documents/lines.server";
import {
	customChanges,
	listFields,
	prepareCustom,
} from "#/modules/fields/fields.server";
import {
	filterConditions,
	sortExpression,
} from "#/modules/views/filters.server";
import { m } from "#/paraglide/messages.js";
import { type Actor, eventInsert } from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import type { Json } from "#/platform/json";
import {
	INVOICE_LIMITS,
	type InvoiceSearch,
	invoiceDisplayStatus,
	invoiceLabel,
	type UpdateInvoiceInput,
} from "./schema";

// Server-only data layer for invoices. Every function takes the workspace id
// first and filters by it; the server functions in invoices.ts pass
// context.workspaceId from the session, never a value from input. A change and
// its event are written in one db.batch (spec §11.1). Status changes lock the
// invoice row and re-check its status (and, for issue and send, the version
// that was read) inside the batch.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function errorCode(error: unknown) {
	const e = error as { code?: string; cause?: { code?: string } };
	return e?.code ?? e?.cause?.code;
}

function errorConstraint(error: unknown) {
	const e = error as { constraint?: string; cause?: { constraint?: string } };
	return e?.constraint ?? e?.cause?.constraint;
}

async function runBatch(statements: unknown[]) {
	try {
		await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
	} catch (error) {
		const code = errorCode(error);
		if (code === "22012") throw clientError(409, m.error_invoice_changed());
		// One invoice per order (a concurrent "Create invoice")
		if (
			code === "23505" &&
			errorConstraint(error) === "invoice_workspace_order_unique"
		)
			throw clientError(409, m.error_order_has_invoice());
		throw error;
	}
}

function lockAndCheck(
	workspaceId: string,
	id: string,
	statuses: string[],
	version?: Date,
) {
	const list = sql.join(
		statuses.map((s) => sql`${s}`),
		sql`, `,
	);
	const same = version
		? sql` and floor(extract(epoch from i."updated_at") * 1000) = ${Math.floor(version.getTime())}`
		: sql``;
	return [
		db
			.select({ id: invoice.id })
			.from(invoice)
			.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId)))
			.for("update"),
		db
			.select({
				ok: sql<number>`1 / (case when exists (select 1 from "invoice" i where i."id" = ${id} and i."workspace_id" = ${workspaceId} and i."archived_at" is null and i."status" in (${list})${same}) then 1 else 0 end)`,
			})
			.from(invoice)
			.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId))),
	];
}

const contactNameOfInvoice = sql<string>`(select concat_ws(' ', c."first_name", c."last_name") from "contact" c where c."id" = "invoice"."contact_id" and c."workspace_id" = "invoice"."workspace_id")`;
const companyNameOfInvoice = sql<
	string | null
>`(select co."name" from "company" co where co."id" = "invoice"."company_id" and co."workspace_id" = "invoice"."workspace_id")`;
const orderNumberOfInvoice = sql<
	number | null
>`(select o."number" from "sales_order" o where o."id" = "invoice"."order_id" and o."workspace_id" = "invoice"."workspace_id")`;

const INVOICE_SORT = {
	number: sql`${invoice.year} nulls first, ${invoice.number}`,
	issueDate: invoice.issueDate,
	dueDate: invoice.dueDate,
	totalCents: invoice.totalCents,
	createdAt: invoice.createdAt,
} as const;

const listColumns = {
	id: invoice.id,
	year: invoice.year,
	number: invoice.number,
	status: invoice.status,
	contactId: invoice.contactId,
	companyId: invoice.companyId,
	dealId: invoice.dealId,
	orderId: invoice.orderId,
	issueDate: invoice.issueDate,
	dueDate: invoice.dueDate,
	currency: invoice.currency,
	totalCents: invoice.totalCents,
	custom: invoice.custom,
	archivedAt: invoice.archivedAt,
	createdAt: invoice.createdAt,
	contactName: contactNameOfInvoice,
	companyName: companyNameOfInvoice,
	orderNumber: orderNumberOfInvoice,
};

function withDisplayStatus<T extends { status: string; dueDate: Date | null }>(
	row: T,
) {
	return {
		...row,
		displayStatus: invoiceDisplayStatus(row.status, row.dueDate),
	};
}

const todayStart = () => new Date(`${utcDay(new Date())}T00:00:00.000Z`);

async function invoiceQuery(workspaceId: string, search: InvoiceSearch) {
	const filters: SQL[] = [
		eq(invoice.workspaceId, workspaceId),
		search.show === "archived"
			? isNotNull(invoice.archivedAt)
			: isNull(invoice.archivedAt),
	];
	if (search.q) {
		const match = /^inv-?(\d{4})-?0*(\d{1,9})$/i.exec(search.q.trim());
		const pattern = likePattern(search.q);
		const or_ = or(
			match
				? and(
						eq(invoice.year, Number(match[1])),
						eq(invoice.number, Number(match[2])),
					)
				: undefined,
			sql`${contactNameOfInvoice} ilike ${pattern}`,
			sql`coalesce(${companyNameOfInvoice}, '') ilike ${pattern}`,
		);
		if (or_) filters.push(or_);
	}
	if (search.status === "overdue")
		filters.push(
			sql`${invoice.status} in ('issued', 'partially_paid')`,
			sql`${invoice.dueDate} < ${todayStart()}`,
		);
	else if (search.status) filters.push(eq(invoice.status, search.status));
	const { fields } = await listFields(workspaceId, "invoice", {
		includeArchived: false,
	});
	filters.push(...filterConditions("invoice", search.filters, fields));
	const order = sortExpression(
		"invoice",
		{ field: search.sort, dir: search.dir },
		fields,
		INVOICE_SORT,
	);
	return { where: and(...filters), order };
}

export async function listInvoices(workspaceId: string, search: InvoiceSearch) {
	const { where, order } = await invoiceQuery(workspaceId, search);
	const [rows, [{ total, value }]] = await Promise.all([
		db
			.select(listColumns)
			.from(invoice)
			.where(where)
			.orderBy(order, desc(invoice.id))
			.limit(search.pageSize)
			.offset((search.page - 1) * search.pageSize),
		db
			.select({ total: count(), value: sum(invoice.totalCents) })
			.from(invoice)
			.where(where),
	]);
	return {
		rows: rows.map(withDisplayStatus),
		total,
		totalValueCents: Number(value ?? 0),
		pageCount: Math.max(1, Math.ceil(total / search.pageSize)),
	};
}

async function findInvoice(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(invoice)
		.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_invoice_not_found());
	return row;
}

export async function getInvoiceDetail(workspaceId: string, id: string) {
	const row = await findInvoice(workspaceId, id);
	const [lines, [names], [workspace]] = await Promise.all([
		db
			.select()
			.from(invoiceLine)
			.where(
				and(
					eq(invoiceLine.invoiceId, id),
					eq(invoiceLine.workspaceId, workspaceId),
				),
			)
			.orderBy(asc(invoiceLine.position)),
		db
			.select({
				contactFirstName: contact.firstName,
				contactLastName: contact.lastName,
				contactEmail: contact.email,
				companyName: companyNameOfInvoice,
				orderNumber: orderNumberOfInvoice,
			})
			.from(invoice)
			.innerJoin(
				contact,
				and(
					eq(contact.id, invoice.contactId),
					eq(contact.workspaceId, invoice.workspaceId),
				),
			)
			.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId))),
		db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, workspaceId)),
	]);
	return {
		invoice: withDisplayStatus(row),
		lines,
		...names,
		workspaceName: workspace?.name ?? "",
	};
}

// A new draft: direct for a contact or deal, or the invoice of a confirmed or
// fulfilled order (its lines, tax and language are copied; one per order)
export async function createInvoice(
	workspaceId: string,
	actor: Actor,
	input: { contactId?: string; dealId?: string; orderId?: string },
) {
	const settings = await getWorkspaceSettings(workspaceId);
	const id = uuidv7();
	const base = {
		id,
		workspaceId,
		ownerId: actor.type === "member" ? actor.id : null,
		createdById: actor.type === "member" ? actor.id : null,
		currency: settings.currency,
		taxRateBp: settings.defaultTaxRateBp,
		subtotalCents: 0,
		taxCents: 0,
		totalCents: 0,
	};
	if (input.orderId) {
		const [o] = await db
			.select()
			.from(salesOrder)
			.where(
				and(
					eq(salesOrder.id, input.orderId),
					eq(salesOrder.workspaceId, workspaceId),
				),
			)
			.limit(1);
		if (!o) throw clientError(404, m.error_order_not_found());
		if (o.archivedAt) throw clientError(409, m.error_record_archived());
		if (o.status !== "confirmed" && o.status !== "fulfilled")
			throw clientError(409, m.error_order_not_confirmed());
		const lines = await db
			.select()
			.from(orderLine)
			.where(
				and(
					eq(orderLine.workspaceId, workspaceId),
					eq(orderLine.orderId, o.id),
				),
			)
			.orderBy(asc(orderLine.position));
		await runBatch([
			// The order is still confirmed or fulfilled and active: a cancel or
			// "back to draft" at the same moment waits for this lock, then sees
			// the invoice and is refused
			db
				.select({ id: salesOrder.id })
				.from(salesOrder)
				.where(
					and(eq(salesOrder.id, o.id), eq(salesOrder.workspaceId, workspaceId)),
				)
				.for("update"),
			db
				.select({
					ok: sql<number>`1 / (case when exists (select 1 from "sales_order" so where so."id" = ${o.id} and so."workspace_id" = ${workspaceId} and so."archived_at" is null and so."status" in ('confirmed', 'fulfilled')) then 1 else 0 end)`,
				})
				.from(salesOrder)
				.where(
					and(eq(salesOrder.id, o.id), eq(salesOrder.workspaceId, workspaceId)),
				),
			db.insert(invoice).values({
				...base,
				orderId: o.id,
				contactId: o.contactId,
				companyId: o.companyId,
				dealId: o.dealId,
				locale: o.locale,
				currency: o.currency,
				taxRateBp: o.taxRateBp,
				subtotalCents: o.subtotalCents,
				taxCents: o.taxCents,
				totalCents: o.totalCents,
				notes: o.notes,
			}),
			...(lines.length
				? [
						db.insert(invoiceLine).values(
							lines.map((l) => ({
								id: uuidv7(),
								workspaceId,
								invoiceId: id,
								position: l.position,
								productId: l.productId,
								description: l.description,
								sku: l.sku,
								quantity: l.quantity,
								unitPriceCents: l.unitPriceCents,
								lineTotalCents: l.lineTotalCents,
							})),
						),
					]
				: []),
			eventInsert(workspaceId, actor, {
				type: "invoice.created",
				subjectType: "invoice",
				subjectId: id,
				payload: { orderId: o.id },
			}),
			eventInsert(workspaceId, actor, {
				type: "order.invoiced",
				subjectType: "order",
				subjectId: o.id,
				payload: { invoiceId: id },
			}),
		]);
		return { id };
	}

	let contactId = input.contactId ?? null;
	let companyId: string | null = null;
	let dealId: string | null = null;
	if (input.dealId) {
		const [d] = await db
			.select({
				id: deal.id,
				contactId: deal.contactId,
				companyId: deal.companyId,
				archivedAt: deal.archivedAt,
			})
			.from(deal)
			.where(and(eq(deal.id, input.dealId), eq(deal.workspaceId, workspaceId)))
			.limit(1);
		if (!d) throw clientError(404, m.error_deal_not_found());
		if (d.archivedAt) throw clientError(409, m.error_record_archived());
		dealId = d.id;
		contactId = d.contactId;
		companyId = d.companyId;
	}
	if (!contactId) throw clientError(400, m.error_choose_contact());
	const [person] = await db
		.select({
			locale: contact.locale,
			companyId: contact.companyId,
			archivedAt: contact.archivedAt,
		})
		.from(contact)
		.where(and(eq(contact.id, contactId), eq(contact.workspaceId, workspaceId)))
		.limit(1);
	if (!person || person.archivedAt)
		throw clientError(400, m.error_choose_contact());
	await runBatch([
		db.insert(invoice).values({
			...base,
			contactId,
			companyId: companyId ?? person.companyId,
			dealId,
			locale: person.locale === "es" ? "es" : "en",
		}),
		eventInsert(workspaceId, actor, {
			type: "invoice.created",
			subjectType: "invoice",
			subjectId: id,
			payload: { dealId },
		}),
	]);
	return { id };
}

export async function updateInvoice(
	workspaceId: string,
	actor: Actor,
	input: UpdateInvoiceInput,
) {
	const before = await findInvoice(workspaceId, input.id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	if (before.status !== "draft")
		throw clientError(409, m.error_invoice_not_draft());
	// A draft of an order keeps the order's contact, lines and tax (owner
	// decision): only notes, language, owner and custom fields change
	if (before.orderId)
		return updateOrderDraft(workspaceId, actor, input, before);
	const totals = documentTotals(input.lines, input.taxRateBp);
	if (totals.problem) throw clientError(400, totals.problem);
	const companyId = input.companyId || null;
	const ownerId = input.ownerId || null;
	await Promise.all([
		input.contactId !== before.contactId
			? db
					.select({ id: contact.id })
					.from(contact)
					.where(
						and(
							eq(contact.id, input.contactId),
							eq(contact.workspaceId, workspaceId),
							isNull(contact.archivedAt),
						),
					)
					.limit(1)
					.then(([r]) => {
						if (!r) throw clientError(400, m.error_choose_contact());
					})
			: null,
		companyId && companyId !== before.companyId
			? db
					.select({ id: company.id })
					.from(company)
					.where(
						and(
							eq(company.id, companyId),
							eq(company.workspaceId, workspaceId),
							isNull(company.archivedAt),
						),
					)
					.limit(1)
					.then(([r]) => {
						if (!r) throw clientError(400, m.error_choose_company());
					})
			: null,
		ownerId && ownerId !== before.ownerId
			? assertWorkspaceRefs(workspaceId, { userId: ownerId })
			: null,
		db
			.select({ productId: invoiceLine.productId })
			.from(invoiceLine)
			.where(
				and(
					eq(invoiceLine.workspaceId, workspaceId),
					eq(invoiceLine.invoiceId, input.id),
				),
			)
			.then((existing) =>
				assertLineProducts(
					workspaceId,
					input.lines,
					existing.map((l) => l.productId),
				),
			),
	]);
	const custom =
		input.custom === undefined
			? before.custom
			: await prepareCustom(
					workspaceId,
					"invoice",
					input.custom,
					before.custom,
					input.id,
				);
	await runBatch([
		...lockAndCheck(workspaceId, input.id, ["draft"]),
		db
			.update(invoice)
			.set({
				contactId: input.contactId,
				companyId,
				ownerId,
				locale: input.locale,
				taxRateBp: input.taxRateBp,
				notes: input.notes || null,
				subtotalCents: totals.subtotalCents,
				taxCents: totals.taxCents,
				totalCents: totals.totalCents,
				custom: custom as Record<string, Json>,
				updatedAt: new Date(),
			})
			.where(
				and(eq(invoice.id, input.id), eq(invoice.workspaceId, workspaceId)),
			),
		db
			.delete(invoiceLine)
			.where(
				and(
					eq(invoiceLine.workspaceId, workspaceId),
					eq(invoiceLine.invoiceId, input.id),
				),
			),
		...(input.lines.length
			? [
					db.insert(invoiceLine).values(
						input.lines.map((l, position) => ({
							id: uuidv7(),
							workspaceId,
							invoiceId: input.id,
							position,
							productId: l.productId || null,
							description: l.description,
							sku: l.sku || null,
							quantity: l.quantity,
							unitPriceCents: l.unitPriceCents,
							lineTotalCents: totals.lineTotals[position],
						})),
					),
				]
			: []),
		eventInsert(workspaceId, actor, {
			type: "invoice.updated",
			subjectType: "invoice",
			subjectId: input.id,
			payload: {
				lines: input.lines.length,
				totalCents: totals.totalCents,
				...(Object.keys(customChanges(before.custom, custom)).length
					? { custom: true }
					: {}),
			},
		}),
	]);
	return { id: input.id };
}

// Saves a draft that belongs to an order: its contact, lines and tax stay the
// order's; language, owner, notes and custom fields can change
async function updateOrderDraft(
	workspaceId: string,
	actor: Actor,
	input: UpdateInvoiceInput,
	before: typeof invoice.$inferSelect,
) {
	const ownerId = input.ownerId || null;
	if (ownerId && ownerId !== before.ownerId)
		await assertWorkspaceRefs(workspaceId, { userId: ownerId });
	const custom =
		input.custom === undefined
			? before.custom
			: await prepareCustom(
					workspaceId,
					"invoice",
					input.custom,
					before.custom,
					input.id,
				);
	await runBatch([
		...lockAndCheck(workspaceId, input.id, ["draft"]),
		db
			.update(invoice)
			.set({
				ownerId,
				locale: input.locale,
				notes: input.notes || null,
				custom: custom as Record<string, Json>,
				updatedAt: new Date(),
			})
			.where(
				and(eq(invoice.id, input.id), eq(invoice.workspaceId, workspaceId)),
			),
		eventInsert(workspaceId, actor, {
			type: "invoice.updated",
			subjectType: "invoice",
			subjectId: input.id,
			payload: { fromOrder: true },
		}),
	]);
	return { id: input.id };
}

// draft -> issued: numbered in this year's series, issued today, due after the
// workspace's payment terms. From here the invoice never changes.
export async function issueInvoice(
	workspaceId: string,
	actor: Actor,
	id: string,
) {
	const before = await findInvoice(workspaceId, id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	if (before.status !== "draft")
		throw clientError(409, m.error_invoice_not_draft());
	const [{ n }] = await db
		.select({ n: count() })
		.from(invoiceLine)
		.where(
			and(
				eq(invoiceLine.workspaceId, workspaceId),
				eq(invoiceLine.invoiceId, id),
			),
		);
	if (!n) throw clientError(400, m.error_invoice_no_lines());
	// A zero total could never be paid and would show as overdue forever
	if (before.totalCents <= 0)
		throw clientError(400, m.error_invoice_zero_total());
	const settings = await getWorkspaceSettings(workspaceId);
	const now = new Date();
	const year = now.getUTCFullYear();
	const issueDate = new Date(`${utcDay(now)}T12:00:00.000Z`);
	const dueDate = new Date(issueDate);
	dueDate.setUTCDate(dueDate.getUTCDate() + settings.paymentTermsDays);
	// The number is taken inside the batch: if anything fails the counter rolls
	// back too, so issued numbers have no gaps (and the counter's row lock
	// serialises two issues at once)
	await runBatch([
		...lockAndCheck(workspaceId, id, ["draft"], before.updatedAt),
		db
			.insert(workspaceCounter)
			.values({ workspaceId, kind: "invoice", year, value: 1 })
			.onConflictDoUpdate({
				target: [
					workspaceCounter.workspaceId,
					workspaceCounter.kind,
					workspaceCounter.year,
				],
				set: { value: sql`${workspaceCounter.value} + 1` },
			}),
		db
			.update(invoice)
			.set({
				status: "issued",
				year,
				number: sql`(select wc."value" from "workspace_counter" wc where wc."workspace_id" = ${workspaceId} and wc."kind" = 'invoice' and wc."year" = ${year})`,
				issueDate,
				dueDate,
				updatedAt: now,
			})
			.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: "invoice.issued",
			subjectType: "invoice",
			subjectId: id,
			payload: { year, totalCents: before.totalCents },
		}),
	]);
	const [{ number }] = await db
		.select({ number: invoice.number })
		.from(invoice)
		.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId)));
	return { id, year, number: number as number };
}

// draft or issued -> void (frees its order to be invoiced again)
export async function voidInvoice(
	workspaceId: string,
	actor: Actor,
	id: string,
) {
	const before = await findInvoice(workspaceId, id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	if (before.status === "void")
		throw clientError(409, m.error_invoice_wrong_status());
	if (before.status !== "draft" && before.status !== "issued")
		throw clientError(409, m.error_invoice_has_payments());
	const [pending] = await db
		.select({ id: payment.id })
		.from(payment)
		.where(
			and(
				eq(payment.workspaceId, workspaceId),
				eq(payment.invoiceId, id),
				sql`${payment.status} in ('reported', 'confirmed')`,
			),
		)
		.limit(1);
	if (pending) throw clientError(409, m.error_invoice_has_payments());
	const now = new Date();
	await runBatch([
		...lockAndCheck(workspaceId, id, ["draft", "issued"]),
		db
			.select({
				ok: sql<number>`1 / (case when not exists (select 1 from "payment" p where p."invoice_id" = ${id} and p."workspace_id" = ${workspaceId} and p."status" in ('reported', 'confirmed')) then 1 else 0 end)`,
			})
			.from(invoice)
			.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId))),
		db
			.update(invoice)
			.set({ status: "void", voidedAt: now, updatedAt: now })
			.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: "invoice.voided",
			subjectType: "invoice",
			subjectId: id,
		}),
	]);
	return { id };
}

// Emails an issued invoice to its contact; replies go to the sending member.
// Capped like quote emails (they leave from the app's own address).
export async function sendInvoice(
	workspaceId: string,
	actor: Actor,
	id: string,
	sender: { name: string; email: string },
) {
	const detail = await getInvoiceDetail(workspaceId, id);
	const inv = detail.invoice;
	if (inv.archivedAt) throw clientError(409, m.error_record_archived());
	if (inv.status !== "issued" && inv.status !== "partially_paid")
		throw clientError(409, m.error_invoice_not_issued());
	if (!detail.contactEmail) throw clientError(400, m.error_quote_no_email());
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const [{ workspaceSent, invoiceSent }] = await db
		.select({
			workspaceSent: sql<number>`count(*) filter (where ${event.createdAt} > ${since})::int`,
			invoiceSent: sql<number>`count(*) filter (where ${event.subjectId} = ${id})::int`,
		})
		.from(event)
		.where(
			and(eq(event.workspaceId, workspaceId), eq(event.type, "invoice.sent")),
		);
	if (workspaceSent >= INVOICE_LIMITS.emailsPerDay)
		throw clientError(
			429,
			m.error_invoice_email_daily_limit({ max: INVOICE_LIMITS.emailsPerDay }),
		);
	if (invoiceSent >= INVOICE_LIMITS.emailsPerInvoice)
		throw clientError(
			429,
			m.error_invoice_email_limit({ max: INVOICE_LIMITS.emailsPerInvoice }),
		);
	const now = new Date();
	await runBatch([
		...lockAndCheck(
			workspaceId,
			id,
			["issued", "partially_paid"],
			inv.updatedAt,
		),
		db
			.update(invoice)
			.set({ sentAt: now, updatedAt: now })
			.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: "invoice.sent",
			subjectType: "invoice",
			subjectId: id,
		}),
	]);
	const locale = inv.locale === "es" ? "es" : "en";
	const o = { locale } as const;
	const number = invoiceLabel(inv.year, inv.number);
	const day = (value: Date | null) =>
		value
			? new Date(value).toLocaleDateString(locale, { timeZone: "UTC" })
			: "";
	const email = documentEmail({
		locale,
		title: m.invoice_doc_title({ number }, o),
		subject: m.invoice_email_subject(
			{ number, workspace: detail.workspaceName },
			o,
		),
		intro: m.invoice_email_intro(
			{ name: detail.contactFirstName, workspace: detail.workspaceName },
			o,
		),
		workspaceName: detail.workspaceName,
		after: [m.invoice_due_text({ date: day(inv.dueDate) }, o)],
		closing: m.invoice_email_reply({ name: sender.name }, o),
		currency: inv.currency,
		taxRateBp: inv.taxRateBp,
		subtotalCents: inv.subtotalCents,
		taxCents: inv.taxCents,
		totalCents: inv.totalCents,
		notes: inv.notes,
		lines: detail.lines,
	});
	try {
		await sendEmail({
			to: detail.contactEmail,
			replyTo: sender.email,
			...email,
		});
	} catch {
		throw clientError(502, m.error_invoice_email_failed());
	}
	return { id };
}

export async function setInvoiceArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findInvoice(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	// Only drafts and void invoices can be archived: an issued one is a record
	if (archived && before.status !== "draft" && before.status !== "void")
		throw clientError(409, m.error_invoice_issued_archive());
	// A draft of an order would keep blocking the order while archived
	if (archived && before.status === "draft" && before.orderId)
		throw clientError(409, m.error_invoice_order_archive());
	await runBatch([
		db
			.select({ id: invoice.id })
			.from(invoice)
			.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId)))
			.for("update"),
		db
			.select({
				ok: sql<number>`1 / (case when exists (select 1 from "invoice" i where i."id" = ${id} and i."workspace_id" = ${workspaceId} and i."archived_at" is ${sql.raw(archived ? "null" : "not null")}${sql.raw(archived ? ` and i."status" in ('draft', 'void')` : "")}) then 1 else 0 end)`,
			})
			.from(invoice)
			.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId))),
		db
			.update(invoice)
			.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
			.where(and(eq(invoice.id, id), eq(invoice.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: archived ? "invoice.archived" : "invoice.restored",
			subjectType: "invoice",
			subjectId: id,
		}),
	]);
	return { id };
}

export async function relatedInvoices(
	workspaceId: string,
	refs: { contactId?: string; dealId?: string; orderId?: string },
) {
	if (!refs.contactId && !refs.dealId && !refs.orderId) return [];
	const rows = await db
		.select(listColumns)
		.from(invoice)
		.where(
			and(
				eq(invoice.workspaceId, workspaceId),
				isNull(invoice.archivedAt),
				refs.contactId ? eq(invoice.contactId, refs.contactId) : undefined,
				refs.dealId ? eq(invoice.dealId, refs.dealId) : undefined,
				refs.orderId ? eq(invoice.orderId, refs.orderId) : undefined,
			),
		)
		.orderBy(desc(invoice.createdAt))
		.limit(50);
	return rows.map(withDisplayStatus);
}
