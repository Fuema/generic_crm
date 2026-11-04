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
	organization,
	quote,
	quoteLine,
} from "#/db/schema";
import { getWorkspaceSettings, nextDocumentNumber } from "#/lib/billing.server";
import { assertWorkspaceRefs } from "#/lib/workspace-refs.server";
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
import { sendQuoteEmail } from "./quote-email.server";
import {
	defaultValidUntil,
	displayStatus,
	QUOTE_LIMITS,
	type QuoteSearch,
	quoteTotals,
	type UpdateQuoteInput,
	utcDay,
} from "./schema";

// Server-only data layer for quotes. Every function takes the workspace id
// first and filters by it; the server functions in quotes.ts pass
// context.workspaceId from the session, never a value from input. A change and
// its event are written in one db.batch (spec §11.1). Status changes lock the
// quote row and re-check its status inside the batch, so two people can't both
// send, accept or edit the same quote.

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

async function runBatch(statements: unknown[]) {
	try {
		await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
	} catch (error) {
		if (errorCode(error) === "22012")
			throw clientError(409, m.error_quote_changed());
		throw error;
	}
}

// Lock the quote, then fail the whole batch unless it is still active and in
// one of the given statuses
// With `version`, the quote must also be exactly the one that was read (its
// updated_at, in milliseconds), so what is emailed or accepted is what is saved
function lockAndCheck(
	workspaceId: string,
	id: string,
	statuses: string[],
	version?: Date,
	// Accepting: still valid on today's UTC day (the valid-until day counts)
	stillValid = false,
) {
	const list = sql.join(
		statuses.map((s) => sql`${s}`),
		sql`, `,
	);
	const same = version
		? sql` and floor(extract(epoch from q."updated_at") * 1000) = ${Math.floor(version.getTime())}`
		: sql``;
	const valid = stillValid
		? sql` and (q."valid_until" is null or q."valid_until" >= date_trunc('day', now() at time zone 'utc'))`
		: sql``;
	return [
		db
			.select({ id: quote.id })
			.from(quote)
			.where(and(eq(quote.id, id), eq(quote.workspaceId, workspaceId)))
			.for("update"),
		db
			.select({
				ok: sql<number>`1 / (case when exists (select 1 from "quote" q where q."id" = ${id} and q."workspace_id" = ${workspaceId} and q."archived_at" is null and q."status" in (${list})${same}${valid}) then 1 else 0 end)`,
			})
			.from(quote)
			.where(and(eq(quote.id, id), eq(quote.workspaceId, workspaceId))),
	];
}

// Correlated subqueries spell out table names (spec §17 pitfall 13)
const contactNameOfQuote = sql<string>`(select concat_ws(' ', c."first_name", c."last_name") from "contact" c where c."id" = "quote"."contact_id" and c."workspace_id" = "quote"."workspace_id")`;
const companyNameOfQuote = sql<
	string | null
>`(select co."name" from "company" co where co."id" = "quote"."company_id" and co."workspace_id" = "quote"."workspace_id")`;
const dealNameOfQuote = sql<
	string | null
>`(select d."name" from "deal" d where d."id" = "quote"."deal_id" and d."workspace_id" = "quote"."workspace_id")`;

const QUOTE_SORT = {
	number: quote.number,
	totalCents: quote.totalCents,
	validUntil: quote.validUntil,
	createdAt: quote.createdAt,
} as const;

const listColumns = {
	id: quote.id,
	number: quote.number,
	status: quote.status,
	contactId: quote.contactId,
	companyId: quote.companyId,
	dealId: quote.dealId,
	currency: quote.currency,
	totalCents: quote.totalCents,
	validUntil: quote.validUntil,
	sentAt: quote.sentAt,
	custom: quote.custom,
	archivedAt: quote.archivedAt,
	createdAt: quote.createdAt,
	contactName: contactNameOfQuote,
	companyName: companyNameOfQuote,
	dealName: dealNameOfQuote,
};

function withDisplayStatus<
	T extends { status: string; validUntil: Date | null },
>(row: T) {
	return { ...row, displayStatus: displayStatus(row.status, row.validUntil) };
}

const today = () => new Date(`${utcDay(new Date())}T00:00:00.000Z`);

async function quoteQuery(workspaceId: string, search: QuoteSearch) {
	const filters: SQL[] = [
		eq(quote.workspaceId, workspaceId),
		search.show === "archived"
			? isNotNull(quote.archivedAt)
			: isNull(quote.archivedAt),
	];
	if (search.q) {
		const digits = search.q.replace(/^quo-?/i, "").replace(/^0+/, "");
		const pattern = likePattern(search.q);
		const match = or(
			/^\d{1,9}$/.test(digits) ? eq(quote.number, Number(digits)) : undefined,
			sql`${contactNameOfQuote} ilike ${pattern}`,
			sql`coalesce(${companyNameOfQuote}, '') ilike ${pattern}`,
			sql`coalesce(${dealNameOfQuote}, '') ilike ${pattern}`,
		);
		if (match) filters.push(match);
	}
	if (search.status === "expired")
		filters.push(
			eq(quote.status, "sent"),
			sql`${quote.validUntil} < ${today()}`,
		);
	else if (search.status === "sent")
		filters.push(
			eq(quote.status, "sent"),
			sql`(${quote.validUntil} is null or ${quote.validUntil} >= ${today()})`,
		);
	else if (search.status) filters.push(eq(quote.status, search.status));
	const { fields } = await listFields(workspaceId, "quote", {
		includeArchived: false,
	});
	filters.push(...filterConditions("quote", search.filters, fields));
	const order = sortExpression(
		"quote",
		{ field: search.sort, dir: search.dir },
		fields,
		QUOTE_SORT,
	);
	return { where: and(...filters), order };
}

export async function listQuotes(workspaceId: string, search: QuoteSearch) {
	const { where, order } = await quoteQuery(workspaceId, search);
	const [rows, [{ total, value }]] = await Promise.all([
		db
			.select(listColumns)
			.from(quote)
			.where(where)
			.orderBy(order, desc(quote.id))
			.limit(search.pageSize)
			.offset((search.page - 1) * search.pageSize),
		db
			.select({ total: count(), value: sum(quote.totalCents) })
			.from(quote)
			.where(where),
	]);
	return {
		rows: rows.map(withDisplayStatus),
		total,
		totalValueCents: Number(value ?? 0),
		pageCount: Math.max(1, Math.ceil(total / search.pageSize)),
	};
}

async function findQuote(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(quote)
		.where(and(eq(quote.id, id), eq(quote.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_quote_not_found());
	return row;
}

// The quote with its lines and the names a document shows
export async function getQuoteDetail(workspaceId: string, id: string) {
	const row = await findQuote(workspaceId, id);
	const [lines, [people], [workspace]] = await Promise.all([
		db
			.select()
			.from(quoteLine)
			.where(
				and(eq(quoteLine.quoteId, id), eq(quoteLine.workspaceId, workspaceId)),
			)
			.orderBy(asc(quoteLine.position)),
		db
			.select({
				contactFirstName: contact.firstName,
				contactLastName: contact.lastName,
				contactEmail: contact.email,
				companyName: companyNameOfQuote,
				dealName: dealNameOfQuote,
				dealStatus: sql<
					string | null
				>`(select d."status" from "deal" d where d."id" = "quote"."deal_id" and d."workspace_id" = "quote"."workspace_id")`,
				dealPipelineId: sql<
					string | null
				>`(select d."pipeline_id" from "deal" d where d."id" = "quote"."deal_id" and d."workspace_id" = "quote"."workspace_id")`,
			})
			.from(quote)
			.innerJoin(
				contact,
				and(
					eq(contact.id, quote.contactId),
					eq(contact.workspaceId, quote.workspaceId),
				),
			)
			.where(and(eq(quote.id, id), eq(quote.workspaceId, workspaceId))),
		db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, workspaceId)),
	]);
	return {
		quote: withDisplayStatus(row),
		lines,
		...people,
		workspaceName: workspace?.name ?? "",
	};
}

// A new draft from a deal (its contact and company come along) or a contact
export async function createQuote(
	workspaceId: string,
	actor: Actor,
	input: { dealId?: string; contactId?: string },
) {
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
	const [[person], settings] = await Promise.all([
		db
			.select({
				id: contact.id,
				locale: contact.locale,
				companyId: contact.companyId,
				archivedAt: contact.archivedAt,
			})
			.from(contact)
			.where(
				and(eq(contact.id, contactId), eq(contact.workspaceId, workspaceId)),
			)
			.limit(1),
		getWorkspaceSettings(workspaceId),
	]);
	if (!person || person.archivedAt)
		throw clientError(400, m.error_choose_contact());
	const number = await nextDocumentNumber(workspaceId, "quote");
	const id = uuidv7();
	await db.batch([
		db.insert(quote).values({
			id,
			workspaceId,
			number,
			contactId,
			companyId: companyId ?? person.companyId,
			dealId,
			ownerId: actor.type === "member" ? actor.id : null,
			locale: person.locale === "es" ? "es" : "en",
			currency: settings.currency,
			taxRateBp: settings.defaultTaxRateBp,
		}),
		eventInsert(workspaceId, actor, {
			type: "quote.created",
			subjectType: "quote",
			subjectId: id,
			payload: { number, dealId },
		}),
	]);
	return { id, number };
}

// Saves a draft: its fields and the whole ordered list of lines
export async function updateQuote(
	workspaceId: string,
	actor: Actor,
	input: UpdateQuoteInput,
) {
	const before = await findQuote(workspaceId, input.id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	if (before.status !== "draft")
		throw clientError(409, m.error_quote_not_draft());
	const totals = quoteTotals(input.lines, input.taxRateBp);
	if (totals.problem) throw clientError(400, totals.problem);

	const checks: Promise<unknown>[] = [];
	if (input.contactId !== before.contactId)
		checks.push(
			db
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
				}),
		);
	const companyId = input.companyId || null;
	if (companyId && companyId !== before.companyId)
		checks.push(
			db
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
				}),
		);
	const ownerId = input.ownerId || null;
	if (ownerId && ownerId !== before.ownerId)
		checks.push(assertWorkspaceRefs(workspaceId, { userId: ownerId }));
	// Catalog lines: this workspace's products, active when newly added
	checks.push(
		db
			.select({ productId: quoteLine.productId })
			.from(quoteLine)
			.where(
				and(
					eq(quoteLine.workspaceId, workspaceId),
					eq(quoteLine.quoteId, input.id),
				),
			)
			.then((existing) =>
				assertLineProducts(
					workspaceId,
					input.lines,
					existing.map((l) => l.productId),
				),
			),
	);
	await Promise.all(checks);
	const custom =
		input.custom === undefined
			? before.custom
			: await prepareCustom(
					workspaceId,
					"quote",
					input.custom,
					before.custom,
					input.id,
				);

	const now = new Date();
	const validUntil = input.validUntil
		? new Date(`${input.validUntil}T12:00:00.000Z`)
		: null;
	const values = {
		contactId: input.contactId,
		companyId,
		ownerId,
		locale: input.locale,
		taxRateBp: input.taxRateBp,
		validUntil,
		notes: input.notes || null,
		subtotalCents: totals.subtotalCents,
		taxCents: totals.taxCents,
		totalCents: totals.totalCents,
	};
	const changed = (Object.keys(values) as (keyof typeof values)[]).filter(
		(k) =>
			JSON.stringify(
				values[k] instanceof Date ? values[k].toISOString() : values[k],
			) !==
			JSON.stringify(
				before[k] instanceof Date
					? (before[k] as Date).toISOString()
					: before[k],
			),
	);
	await runBatch([
		...lockAndCheck(workspaceId, input.id, ["draft"]),
		db
			.update(quote)
			.set({
				...values,
				custom: custom as Record<string, Json>,
				updatedAt: now,
			})
			.where(and(eq(quote.id, input.id), eq(quote.workspaceId, workspaceId))),
		db
			.delete(quoteLine)
			.where(
				and(
					eq(quoteLine.workspaceId, workspaceId),
					eq(quoteLine.quoteId, input.id),
				),
			),
		...(input.lines.length
			? [
					db.insert(quoteLine).values(
						input.lines.map((l, position) => ({
							id: uuidv7(),
							workspaceId,
							quoteId: input.id,
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
			type: "quote.updated",
			subjectType: "quote",
			subjectId: input.id,
			payload: {
				fields: changed,
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

// draft -> sent; emails the quote to the contact when asked
export async function sendQuote(
	workspaceId: string,
	actor: Actor,
	input: { id: string; email: boolean },
	sender: { name: string; email: string },
) {
	const detail = await getQuoteDetail(workspaceId, input.id);
	const q = detail.quote;
	if (q.archivedAt) throw clientError(409, m.error_record_archived());
	if (q.status !== "draft") throw clientError(409, m.error_quote_not_draft());
	if (!detail.lines.length) throw clientError(400, m.error_quote_no_lines());
	if (input.email && !detail.contactEmail)
		throw clientError(400, m.error_quote_no_email());
	if (input.email) {
		// Quote emails leave from the app's own address: a cap per workspace and
		// per quote keeps one account from flooding anyone (spec §12.3)
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
		const [{ workspaceSent, quoteSent }] = await db
			.select({
				workspaceSent: sql<number>`count(*) filter (where ${event.createdAt} > ${since})::int`,
				quoteSent: sql<number>`count(*) filter (where ${event.subjectId} = ${input.id})::int`,
			})
			.from(event)
			.where(
				and(
					eq(event.workspaceId, workspaceId),
					eq(event.type, "quote.sent"),
					sql`${event.payload} ->> 'email' = 'true'`,
				),
			);
		if (workspaceSent >= QUOTE_LIMITS.emailsPerDay)
			throw clientError(
				429,
				m.error_quote_email_daily_limit({ max: QUOTE_LIMITS.emailsPerDay }),
			);
		if (quoteSent >= QUOTE_LIMITS.emailsPerQuote)
			throw clientError(
				429,
				m.error_quote_email_quote_limit({ max: QUOTE_LIMITS.emailsPerQuote }),
			);
	}
	const now = new Date();
	const validUntil =
		q.validUntil && utcDay(q.validUntil) >= utcDay(now)
			? q.validUntil
			: q.validUntil
				? null
				: defaultValidUntil(now);
	if (!validUntil) throw clientError(400, m.error_quote_valid_past());
	await runBatch([
		...lockAndCheck(workspaceId, input.id, ["draft"], q.updatedAt),
		db
			.update(quote)
			.set({ status: "sent", sentAt: now, validUntil, updatedAt: now })
			.where(and(eq(quote.id, input.id), eq(quote.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: "quote.sent",
			subjectType: "quote",
			subjectId: input.id,
			payload: { email: input.email },
		}),
	]);
	// The quote is sent once the status is saved; a failed email is reported
	// but doesn't undo it (it can be sent again after "Back to draft")
	if (input.email && detail.contactEmail) {
		try {
			await sendQuoteEmail({
				to: detail.contactEmail,
				replyTo: sender.email,
				senderName: sender.name,
				workspaceName: detail.workspaceName,
				contactName: detail.contactFirstName,
				quote: { ...q, validUntil },
				lines: detail.lines,
			});
		} catch {
			throw clientError(502, m.error_quote_email_failed());
		}
	}
	return { id: input.id };
}

// sent (or expired) -> draft, to change it and send it again
export async function reopenQuote(
	workspaceId: string,
	actor: Actor,
	id: string,
) {
	const before = await findQuote(workspaceId, id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	if (before.status !== "sent")
		throw clientError(409, m.error_quote_not_sent());
	await runBatch([
		...lockAndCheck(workspaceId, id, ["sent"]),
		db
			.update(quote)
			.set({ status: "draft", updatedAt: new Date() })
			.where(and(eq(quote.id, id), eq(quote.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: "quote.reopened",
			subjectType: "quote",
			subjectId: id,
		}),
	]);
	return { id };
}

// A decision made by the customer in the portal (phase 4 step 3): the
// contact signed in, the name typed to accept, where it came from
export type PortalDecision = {
	contactId: string;
	// The quote as the customer saw it (its updated_at, in ms): a quote
	// changed and resent since then is refused, not accepted unseen
	version: number;
	acceptedName?: string;
	ip: string | null;
	userAgent: string | null;
};

function decidedBy(portal?: PortalDecision) {
	return portal
		? {
				decidedVia: "portal",
				decidedByContactId: portal.contactId,
				acceptedName: portal.acceptedName ?? null,
				decidedIp: portal.ip?.slice(0, 64) ?? null,
				decidedUserAgent: portal.userAgent?.slice(0, 300) ?? null,
			}
		: { decidedVia: "staff" };
}

// sent -> accepted, while it is still valid. Returns the deal it belongs to,
// so the page can offer to mark it won (a customer's acceptance never moves
// the deal: staff decide, owner decision 2026-11-04).
export async function acceptQuote(
	workspaceId: string,
	actor: Actor,
	id: string,
	portal?: PortalDecision,
) {
	const before = await findQuote(workspaceId, id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	if (before.status !== "sent")
		throw clientError(409, m.error_quote_not_sent());
	if (displayStatus(before.status, before.validUntil) === "expired")
		throw clientError(409, m.error_quote_expired());
	if (portal && before.updatedAt.getTime() !== portal.version)
		throw clientError(409, m.error_quote_changed());
	const now = new Date();
	await runBatch([
		...lockAndCheck(
			workspaceId,
			id,
			["sent"],
			portal ? new Date(portal.version) : before.updatedAt,
			true,
		),
		db
			.update(quote)
			.set({
				status: "accepted",
				acceptedAt: now,
				...decidedBy(portal),
				updatedAt: now,
			})
			.where(and(eq(quote.id, id), eq(quote.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: "quote.accepted",
			subjectType: "quote",
			subjectId: id,
			payload: {
				totalCents: before.totalCents,
				...(portal ? { via: "portal", name: portal.acceptedName ?? null } : {}),
			},
		}),
	]);
	return { id, dealId: before.dealId };
}

// sent (or expired) -> declined, with an optional reason
export async function declineQuote(
	workspaceId: string,
	actor: Actor,
	input: { id: string; reason: string },
	portal?: PortalDecision,
) {
	const before = await findQuote(workspaceId, input.id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	if (before.status !== "sent")
		throw clientError(409, m.error_quote_not_sent());
	if (portal && before.updatedAt.getTime() !== portal.version)
		throw clientError(409, m.error_quote_changed());
	const now = new Date();
	await runBatch([
		...lockAndCheck(
			workspaceId,
			input.id,
			["sent"],
			portal ? new Date(portal.version) : undefined,
		),
		db
			.update(quote)
			.set({
				status: "declined",
				declinedAt: now,
				declineReason: input.reason || null,
				...decidedBy(portal),
				updatedAt: now,
			})
			.where(and(eq(quote.id, input.id), eq(quote.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: "quote.declined",
			subjectType: "quote",
			subjectId: input.id,
			payload: {
				reason: input.reason || null,
				...(portal ? { via: "portal" } : {}),
			},
		}),
	]);
	return { id: input.id };
}

export async function setQuoteArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findQuote(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	await runBatch([
		db
			.select({ id: quote.id })
			.from(quote)
			.where(and(eq(quote.id, id), eq(quote.workspaceId, workspaceId)))
			.for("update"),
		db
			.select({
				ok: sql<number>`1 / (case when exists (select 1 from "quote" q where q."id" = ${id} and q."workspace_id" = ${workspaceId} and q."archived_at" is ${sql.raw(archived ? "null" : "not null")}) then 1 else 0 end)`,
			})
			.from(quote)
			.where(and(eq(quote.id, id), eq(quote.workspaceId, workspaceId))),
		db
			.update(quote)
			.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
			.where(and(eq(quote.id, id), eq(quote.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: archived ? "quote.archived" : "quote.restored",
			subjectType: "quote",
			subjectId: id,
		}),
	]);
	return { id };
}

// The quotes of a contact or deal, newest first (record pages)
export async function relatedQuotes(
	workspaceId: string,
	refs: { contactId?: string; dealId?: string },
) {
	if (!refs.contactId && !refs.dealId) return [];
	const rows = await db
		.select(listColumns)
		.from(quote)
		.where(
			and(
				eq(quote.workspaceId, workspaceId),
				isNull(quote.archivedAt),
				refs.contactId ? eq(quote.contactId, refs.contactId) : undefined,
				refs.dealId ? eq(quote.dealId, refs.dealId) : undefined,
			),
		)
		.orderBy(desc(quote.number))
		.limit(50);
	return rows.map(withDisplayStatus);
}
