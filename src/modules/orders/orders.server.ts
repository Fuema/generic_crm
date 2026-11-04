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
	invoice,
	orderLine,
	organization,
	quote,
	quoteLine,
	salesOrder,
} from "#/db/schema";
import { getWorkspaceSettings, nextDocumentNumber } from "#/lib/billing.server";
import { assertWorkspaceRefs } from "#/lib/workspace-refs.server";
import { dayToStored, documentTotals } from "#/modules/documents/lines";
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
	ORDER_TRANSITIONS,
	type OrderAction,
	type OrderSearch,
	type UpdateOrderInput,
} from "./schema";

// Server-only data layer for orders. Every function takes the workspace id
// first and filters by it; the server functions in orders.ts pass
// context.workspaceId from the session, never a value from input. A change and
// its event are written in one db.batch (spec §11.1). Status changes lock the
// order row and re-check its status inside the batch.

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
		if (code === "22012") throw clientError(409, m.error_order_changed());
		// One order per quote (a concurrent "Create order")
		if (
			code === "23505" &&
			errorConstraint(error) === "sales_order_workspace_quote_unique"
		)
			throw clientError(409, m.error_quote_has_order());
		throw error;
	}
}

// Lock the order, then fail the whole batch unless it is still active and in
// one of the given statuses (and, with `noInvoice`, has no invoice that isn't
// void)
function lockAndCheck(
	workspaceId: string,
	id: string,
	statuses: string[],
	noInvoice = false,
	hasLines = false,
) {
	const list = sql.join(
		statuses.map((s) => sql`${s}`),
		sql`, `,
	);
	const invoiceFree = noInvoice
		? sql` and not exists (select 1 from "invoice" i where i."order_id" = ${id} and i."workspace_id" = ${workspaceId} and i."status" <> 'void')`
		: sql``;
	const withLines = hasLines
		? sql` and exists (select 1 from "order_line" ol where ol."order_id" = ${id} and ol."workspace_id" = ${workspaceId})`
		: sql``;
	return [
		db
			.select({ id: salesOrder.id })
			.from(salesOrder)
			.where(
				and(eq(salesOrder.id, id), eq(salesOrder.workspaceId, workspaceId)),
			)
			.for("update"),
		db
			.select({
				ok: sql<number>`1 / (case when exists (select 1 from "sales_order" o where o."id" = ${id} and o."workspace_id" = ${workspaceId} and o."archived_at" is null and o."status" in (${list}))${invoiceFree}${withLines} then 1 else 0 end)`,
			})
			.from(salesOrder)
			.where(
				and(eq(salesOrder.id, id), eq(salesOrder.workspaceId, workspaceId)),
			),
	];
}

// Correlated subqueries spell out table names (spec §17 pitfall 13)
const contactNameOfOrder = sql<string>`(select concat_ws(' ', c."first_name", c."last_name") from "contact" c where c."id" = "sales_order"."contact_id" and c."workspace_id" = "sales_order"."workspace_id")`;
const companyNameOfOrder = sql<
	string | null
>`(select co."name" from "company" co where co."id" = "sales_order"."company_id" and co."workspace_id" = "sales_order"."workspace_id")`;
const dealNameOfOrder = sql<
	string | null
>`(select d."name" from "deal" d where d."id" = "sales_order"."deal_id" and d."workspace_id" = "sales_order"."workspace_id")`;
// The order's invoice that isn't void, if any
const invoiceOfOrder = sql<
	string | null
>`(select i."id" from "invoice" i where i."order_id" = "sales_order"."id" and i."workspace_id" = "sales_order"."workspace_id" and i."status" <> 'void' limit 1)`;

const ORDER_SORT = {
	number: salesOrder.number,
	orderDate: salesOrder.orderDate,
	totalCents: salesOrder.totalCents,
	createdAt: salesOrder.createdAt,
} as const;

const listColumns = {
	id: salesOrder.id,
	number: salesOrder.number,
	status: salesOrder.status,
	contactId: salesOrder.contactId,
	companyId: salesOrder.companyId,
	dealId: salesOrder.dealId,
	quoteId: salesOrder.quoteId,
	orderDate: salesOrder.orderDate,
	currency: salesOrder.currency,
	totalCents: salesOrder.totalCents,
	custom: salesOrder.custom,
	archivedAt: salesOrder.archivedAt,
	createdAt: salesOrder.createdAt,
	contactName: contactNameOfOrder,
	companyName: companyNameOfOrder,
	dealName: dealNameOfOrder,
	invoiceId: invoiceOfOrder,
};

async function orderQuery(workspaceId: string, search: OrderSearch) {
	const filters: SQL[] = [
		eq(salesOrder.workspaceId, workspaceId),
		search.show === "archived"
			? isNotNull(salesOrder.archivedAt)
			: isNull(salesOrder.archivedAt),
	];
	if (search.q) {
		const digits = search.q.replace(/^ord-?/i, "").replace(/^0+/, "");
		const pattern = likePattern(search.q);
		const match = or(
			/^\d{1,9}$/.test(digits)
				? eq(salesOrder.number, Number(digits))
				: undefined,
			sql`${contactNameOfOrder} ilike ${pattern}`,
			sql`coalesce(${companyNameOfOrder}, '') ilike ${pattern}`,
			sql`coalesce(${dealNameOfOrder}, '') ilike ${pattern}`,
		);
		if (match) filters.push(match);
	}
	if (search.status) filters.push(eq(salesOrder.status, search.status));
	const { fields } = await listFields(workspaceId, "order", {
		includeArchived: false,
	});
	filters.push(...filterConditions("order", search.filters, fields));
	const order = sortExpression(
		"order",
		{ field: search.sort, dir: search.dir },
		fields,
		ORDER_SORT,
	);
	return { where: and(...filters), order };
}

export async function listOrders(workspaceId: string, search: OrderSearch) {
	const { where, order } = await orderQuery(workspaceId, search);
	const [rows, [{ total, value }]] = await Promise.all([
		db
			.select(listColumns)
			.from(salesOrder)
			.where(where)
			.orderBy(order, desc(salesOrder.id))
			.limit(search.pageSize)
			.offset((search.page - 1) * search.pageSize),
		db
			.select({ total: count(), value: sum(salesOrder.totalCents) })
			.from(salesOrder)
			.where(where),
	]);
	return {
		rows,
		total,
		totalValueCents: Number(value ?? 0),
		pageCount: Math.max(1, Math.ceil(total / search.pageSize)),
	};
}

async function findOrder(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(salesOrder)
		.where(and(eq(salesOrder.id, id), eq(salesOrder.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_order_not_found());
	return row;
}

export async function getOrderDetail(workspaceId: string, id: string) {
	const row = await findOrder(workspaceId, id);
	const [lines, [names], [workspace]] = await Promise.all([
		db
			.select()
			.from(orderLine)
			.where(
				and(eq(orderLine.orderId, id), eq(orderLine.workspaceId, workspaceId)),
			)
			.orderBy(asc(orderLine.position)),
		db
			.select({
				contactFirstName: contact.firstName,
				contactLastName: contact.lastName,
				contactEmail: contact.email,
				companyName: companyNameOfOrder,
				dealName: dealNameOfOrder,
				invoiceId: invoiceOfOrder,
				quoteNumber: sql<
					number | null
				>`(select q."number" from "quote" q where q."id" = "sales_order"."quote_id" and q."workspace_id" = "sales_order"."workspace_id")`,
			})
			.from(salesOrder)
			.innerJoin(
				contact,
				and(
					eq(contact.id, salesOrder.contactId),
					eq(contact.workspaceId, salesOrder.workspaceId),
				),
			)
			.where(
				and(eq(salesOrder.id, id), eq(salesOrder.workspaceId, workspaceId)),
			),
		db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, workspaceId)),
	]);
	return { order: row, lines, ...names, workspaceName: workspace?.name ?? "" };
}

async function activeContact(workspaceId: string, id: string) {
	const [row] = await db
		.select({
			id: contact.id,
			locale: contact.locale,
			companyId: contact.companyId,
			archivedAt: contact.archivedAt,
		})
		.from(contact)
		.where(and(eq(contact.id, id), eq(contact.workspaceId, workspaceId)))
		.limit(1);
	if (!row || row.archivedAt) throw clientError(400, m.error_choose_contact());
	return row;
}

// A new draft: for a contact, for a deal (its contact and company come along),
// or from an accepted quote (its lines, tax and language are copied)
export async function createOrder(
	workspaceId: string,
	actor: Actor,
	input: { contactId?: string; dealId?: string; quoteId?: string },
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
	};

	if (input.quoteId) {
		const [q] = await db
			.select()
			.from(quote)
			.where(
				and(eq(quote.id, input.quoteId), eq(quote.workspaceId, workspaceId)),
			)
			.limit(1);
		if (!q) throw clientError(404, m.error_quote_not_found());
		if (q.archivedAt) throw clientError(409, m.error_record_archived());
		if (q.status !== "accepted")
			throw clientError(409, m.error_quote_not_accepted());
		const [lines, [existing]] = await Promise.all([
			db
				.select()
				.from(quoteLine)
				.where(
					and(
						eq(quoteLine.workspaceId, workspaceId),
						eq(quoteLine.quoteId, q.id),
					),
				)
				.orderBy(asc(quoteLine.position)),
			db
				.select({ id: salesOrder.id })
				.from(salesOrder)
				.where(
					and(
						eq(salesOrder.workspaceId, workspaceId),
						eq(salesOrder.quoteId, q.id),
					),
				)
				.limit(1),
		]);
		if (existing) throw clientError(409, m.error_quote_has_order());
		const number = await nextDocumentNumber(workspaceId, "order");
		await runBatch([
			// The quote is still accepted and active (archived meanwhile: refused)
			db
				.select({ id: quote.id })
				.from(quote)
				.where(and(eq(quote.id, q.id), eq(quote.workspaceId, workspaceId)))
				.for("update"),
			db
				.select({
					ok: sql<number>`1 / (case when exists (select 1 from "quote" qq where qq."id" = ${q.id} and qq."workspace_id" = ${workspaceId} and qq."archived_at" is null and qq."status" = 'accepted') then 1 else 0 end)`,
				})
				.from(quote)
				.where(and(eq(quote.id, q.id), eq(quote.workspaceId, workspaceId))),
			db.insert(salesOrder).values({
				...base,
				number,
				contactId: q.contactId,
				companyId: q.companyId,
				dealId: q.dealId,
				quoteId: q.id,
				locale: q.locale,
				currency: q.currency,
				taxRateBp: q.taxRateBp,
				subtotalCents: q.subtotalCents,
				taxCents: q.taxCents,
				totalCents: q.totalCents,
				notes: q.notes,
			}),
			...(lines.length
				? [
						db.insert(orderLine).values(
							lines.map((l) => ({
								id: uuidv7(),
								workspaceId,
								orderId: id,
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
				type: "order.created",
				subjectType: "order",
				subjectId: id,
				payload: { number, quoteId: q.id },
			}),
			eventInsert(workspaceId, actor, {
				type: "quote.ordered",
				subjectType: "quote",
				subjectId: q.id,
				payload: { orderId: id, number },
			}),
		]);
		return { id, number };
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
	const person = await activeContact(workspaceId, contactId);
	const number = await nextDocumentNumber(workspaceId, "order");
	await runBatch([
		db.insert(salesOrder).values({
			...base,
			number,
			contactId,
			companyId: companyId ?? person.companyId,
			dealId,
			locale: person.locale === "es" ? "es" : "en",
		}),
		eventInsert(workspaceId, actor, {
			type: "order.created",
			subjectType: "order",
			subjectId: id,
			payload: { number, dealId },
		}),
	]);
	return { id, number };
}

// Saves a draft: its fields and the whole ordered list of lines
export async function updateOrder(
	workspaceId: string,
	actor: Actor,
	input: UpdateOrderInput,
) {
	const before = await findOrder(workspaceId, input.id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	if (before.status !== "draft")
		throw clientError(409, m.error_order_not_draft());
	const totals = documentTotals(input.lines, input.taxRateBp);
	if (totals.problem) throw clientError(400, totals.problem);
	const companyId = input.companyId || null;
	const ownerId = input.ownerId || null;
	await Promise.all([
		input.contactId !== before.contactId
			? activeContact(workspaceId, input.contactId)
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
			.select({ productId: orderLine.productId })
			.from(orderLine)
			.where(
				and(
					eq(orderLine.workspaceId, workspaceId),
					eq(orderLine.orderId, input.id),
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
					"order",
					input.custom,
					before.custom,
					input.id,
				);
	await runBatch([
		...lockAndCheck(workspaceId, input.id, ["draft"]),
		db
			.update(salesOrder)
			.set({
				contactId: input.contactId,
				companyId,
				ownerId,
				locale: input.locale,
				taxRateBp: input.taxRateBp,
				orderDate: dayToStored(input.orderDate) ?? before.orderDate,
				notes: input.notes || null,
				subtotalCents: totals.subtotalCents,
				taxCents: totals.taxCents,
				totalCents: totals.totalCents,
				custom: custom as Record<string, Json>,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(salesOrder.id, input.id),
					eq(salesOrder.workspaceId, workspaceId),
				),
			),
		db
			.delete(orderLine)
			.where(
				and(
					eq(orderLine.workspaceId, workspaceId),
					eq(orderLine.orderId, input.id),
				),
			),
		...(input.lines.length
			? [
					db.insert(orderLine).values(
						input.lines.map((l, position) => ({
							id: uuidv7(),
							workspaceId,
							orderId: input.id,
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
			type: "order.updated",
			subjectType: "order",
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

// confirm (needs a line), fulfil, cancel and "back to draft" (both refused
// while the order has an invoice that isn't void)
export async function changeOrderStatus(
	workspaceId: string,
	actor: Actor,
	id: string,
	action: OrderAction,
) {
	const before = await findOrder(workspaceId, id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	const step = ORDER_TRANSITIONS[action];
	if (!step.from.includes(before.status as never))
		throw clientError(409, m.error_order_wrong_status());
	const needsNoInvoice = action === "cancel" || action === "reopen";
	if (action === "confirm") {
		const [{ n }] = await db
			.select({ n: count() })
			.from(orderLine)
			.where(
				and(eq(orderLine.workspaceId, workspaceId), eq(orderLine.orderId, id)),
			);
		if (!n) throw clientError(400, m.error_order_no_lines());
	}
	if (needsNoInvoice) {
		const [has] = await db
			.select({ id: invoice.id })
			.from(invoice)
			.where(
				and(
					eq(invoice.workspaceId, workspaceId),
					eq(invoice.orderId, id),
					sql`${invoice.status} <> 'void'`,
				),
			)
			.limit(1);
		if (has) throw clientError(409, m.error_order_has_invoice());
	}
	await runBatch([
		...lockAndCheck(
			workspaceId,
			id,
			step.from,
			needsNoInvoice,
			action === "confirm",
		),
		db
			.update(salesOrder)
			.set({ status: step.to, updatedAt: new Date() })
			.where(
				and(eq(salesOrder.id, id), eq(salesOrder.workspaceId, workspaceId)),
			),
		eventInsert(workspaceId, actor, {
			type: `order.${action === "reopen" ? "reopened" : step.to}`,
			subjectType: "order",
			subjectId: id,
		}),
	]);
	return { id };
}

export async function setOrderArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findOrder(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	await runBatch([
		db
			.select({ id: salesOrder.id })
			.from(salesOrder)
			.where(
				and(eq(salesOrder.id, id), eq(salesOrder.workspaceId, workspaceId)),
			)
			.for("update"),
		db
			.select({
				ok: sql<number>`1 / (case when exists (select 1 from "sales_order" o where o."id" = ${id} and o."workspace_id" = ${workspaceId} and o."archived_at" is ${sql.raw(archived ? "null" : "not null")}) then 1 else 0 end)`,
			})
			.from(salesOrder)
			.where(
				and(eq(salesOrder.id, id), eq(salesOrder.workspaceId, workspaceId)),
			),
		db
			.update(salesOrder)
			.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
			.where(
				and(eq(salesOrder.id, id), eq(salesOrder.workspaceId, workspaceId)),
			),
		eventInsert(workspaceId, actor, {
			type: archived ? "order.archived" : "order.restored",
			subjectType: "order",
			subjectId: id,
		}),
	]);
	return { id };
}

// The orders of a contact, deal or quote, newest first (record pages)
export async function relatedOrders(
	workspaceId: string,
	refs: { contactId?: string; dealId?: string; quoteId?: string },
) {
	if (!refs.contactId && !refs.dealId && !refs.quoteId) return [];
	return db
		.select(listColumns)
		.from(salesOrder)
		.where(
			and(
				eq(salesOrder.workspaceId, workspaceId),
				isNull(salesOrder.archivedAt),
				refs.contactId ? eq(salesOrder.contactId, refs.contactId) : undefined,
				refs.dealId ? eq(salesOrder.dealId, refs.dealId) : undefined,
				refs.quoteId ? eq(salesOrder.quoteId, refs.quoteId) : undefined,
			),
		)
		.orderBy(desc(salesOrder.number))
		.limit(50);
}
