import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	isNotNull,
	isNull,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { db } from "#/db/index";
import { company, contact, member, user } from "#/db/schema";
import { assertWorkspaceRefs } from "#/lib/workspace-refs.server";
import { customChanges, prepareCustom } from "#/modules/fields/fields.server";
import { m } from "#/paraglide/messages.js";
import {
	type Actor,
	changedFields,
	eventInsert,
} from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import type {
	CompanyInput,
	CompanySearch,
	ContactInput,
	ContactSearch,
} from "./schema";

// Server-only data layer for contacts and companies. Every function takes the
// workspace id first and filters by it; the server functions in contacts.ts pass
// context.workspaceId from the session, never a value from input. Writes put the
// change and its event in one db.batch (spec §11.1).

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

// Escape LIKE wildcards so a search for "50%" matches the literal text
function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Postgres unique_violation, raised when two requests race past the duplicate check
function isUniqueViolation(error: unknown) {
	const e = error as { code?: string; cause?: { code?: string } };
	return e?.code === "23505" || e?.cause?.code === "23505";
}

function page<T>(rows: T[], total: number, pageSize: number) {
	return { rows, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

// Correlated subqueries spell out table names: Drizzle renders columns inside
// a select as bare names ("id"), which a subquery would resolve to its own table.
const ownerNameOf = (table: "contact" | "company") =>
	sql<
		string | null
	>`(select u."name" from "user" u where u."id" = ${sql.raw(`"${table}"."owner_id"`)})`;

// The tags on each row, as [{ id, name, color }] ordered by name
const tagsOf = (table: "contact" | "company") =>
	sql<
		{ id: string; name: string; color: string }[]
	>`(select coalesce(json_agg(json_build_object('id', t."id", 'name', t."name", 'color', t."color") order by t."name"), '[]'::json) from "record_tag" rt join "tag" t on t."id" = rt."tag_id" and t."workspace_id" = rt."workspace_id" where rt."subject_type" = ${table} and rt."subject_id" = ${sql.raw(`"${table}"."id"`)} and rt."workspace_id" = ${sql.raw(`"${table}"."workspace_id"`)})`;

// Rows that carry the given tag
const hasTag = (table: "contact" | "company", tagId: string) =>
	sql`exists (select 1 from "record_tag" rt where rt."tag_id" = ${tagId} and rt."subject_type" = ${table} and rt."subject_id" = ${sql.raw(`"${table}"."id"`)} and rt."workspace_id" = ${sql.raw(`"${table}"."workspace_id"`)})`;

// ---------------------------------------------------------------- contacts

const CONTACT_SORT = {
	name: contact.firstName,
	email: contact.email,
	lifecycleStage: contact.lifecycleStage,
	createdAt: contact.createdAt,
} as const;

function contactRow(data: ContactInput) {
	return {
		firstName: data.firstName,
		lastName: data.lastName || null,
		email: data.email || null,
		phone: data.phone || null,
		jobTitle: data.jobTitle || null,
		companyId: data.companyId || null,
		ownerId: data.ownerId || null,
		lifecycleStage: data.lifecycleStage,
		locale: data.locale || null,
		emailConsent: data.emailConsent,
	};
}

// References are checked when they are set or changed. An unchanged owner who
// has since left the workspace, or an unchanged company that was archived, must
// not block editing the rest of the record.
async function assertContactValid(
	workspaceId: string,
	data: ContactInput,
	before?: { id: string; ownerId: string | null; companyId: string | null },
) {
	const ownerId = data.ownerId || null;
	const companyId = data.companyId || null;
	await assertWorkspaceRefs(workspaceId, {
		userId: ownerId !== (before?.ownerId ?? null) ? ownerId : null,
	});
	if (companyId && companyId !== (before?.companyId ?? null)) {
		// New links only to active companies of this workspace
		const [linkable] = await db
			.select({ id: company.id })
			.from(company)
			.where(
				and(
					eq(company.id, companyId),
					eq(company.workspaceId, workspaceId),
					isNull(company.archivedAt),
				),
			)
			.limit(1);
		if (!linkable) throw clientError(400, m.error_choose_company());
	}
	const exceptId = before?.id;
	if (!data.email) return;
	const conditions = [
		eq(contact.workspaceId, workspaceId),
		sql`lower(${contact.email}) = ${data.email.toLowerCase()}`,
	];
	if (exceptId) conditions.push(ne(contact.id, exceptId));
	const [duplicate] = await db
		.select({ id: contact.id })
		.from(contact)
		.where(and(...conditions))
		.limit(1);
	if (duplicate) throw clientError(409, m.error_contact_email_taken());
}

async function findContact(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(contact)
		.where(and(eq(contact.id, id), eq(contact.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_contact_not_found());
	return row;
}

export async function listContacts(workspaceId: string, search: ContactSearch) {
	const filters: SQL[] = [
		eq(contact.workspaceId, workspaceId),
		search.show === "archived"
			? isNotNull(contact.archivedAt)
			: isNull(contact.archivedAt),
	];
	if (search.q) {
		const pattern = likePattern(search.q);
		const match = or(
			ilike(contact.firstName, pattern),
			ilike(contact.lastName, pattern),
			ilike(contact.email, pattern),
			ilike(contact.phone, pattern),
			ilike(contact.jobTitle, pattern),
		);
		if (match) filters.push(match);
	}
	if (search.status) filters.push(eq(contact.lifecycleStage, search.status));
	if (search.company) filters.push(eq(contact.companyId, search.company));
	if (search.tag) filters.push(hasTag("contact", search.tag));
	const where = and(...filters);
	const column = CONTACT_SORT[search.sort];
	const order = search.dir === "asc" ? asc(column) : desc(column);

	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				id: contact.id,
				firstName: contact.firstName,
				lastName: contact.lastName,
				email: contact.email,
				phone: contact.phone,
				jobTitle: contact.jobTitle,
				lifecycleStage: contact.lifecycleStage,
				companyId: contact.companyId,
				companyName: company.name,
				ownerName: ownerNameOf("contact"),
				tags: tagsOf("contact"),
				archivedAt: contact.archivedAt,
				createdAt: contact.createdAt,
			})
			.from(contact)
			// The company must be in the same workspace too (defence in depth)
			.leftJoin(
				company,
				and(
					eq(company.id, contact.companyId),
					eq(company.workspaceId, contact.workspaceId),
				),
			)
			.where(where)
			// id as a tie-breaker keeps pages stable when sort values repeat
			.orderBy(order, asc(contact.id))
			.limit(search.pageSize)
			.offset((search.page - 1) * search.pageSize),
		db.select({ total: count() }).from(contact).where(where),
	]);
	return page(rows, total, search.pageSize);
}

export async function getContactDetail(workspaceId: string, id: string) {
	const row = await findContact(workspaceId, id);
	const [companyRow, owner] = await Promise.all([
		row.companyId
			? db
					.select({ id: company.id, name: company.name })
					.from(company)
					.where(
						and(
							eq(company.id, row.companyId),
							eq(company.workspaceId, workspaceId),
						),
					)
					.then((r) => r[0] ?? null)
			: null,
		row.ownerId
			? db
					.select({ name: user.name })
					.from(user)
					.where(eq(user.id, row.ownerId))
					.then((r) => r[0]?.name ?? null)
			: null,
	]);
	return { contact: row, company: companyRow, ownerName: owner };
}

export async function createContact(
	workspaceId: string,
	actor: Actor,
	data: ContactInput,
) {
	await assertContactValid(workspaceId, data);
	const custom = await prepareCustom(workspaceId, "contact", data.custom ?? {});
	const id = uuidv7();
	try {
		await db.batch([
			db.insert(contact).values({
				id,
				workspaceId,
				createdById: actor.type === "member" ? actor.id : null,
				...contactRow(data),
				custom,
			}),
			eventInsert(workspaceId, actor, {
				type: "contact.created",
				subjectType: "contact",
				subjectId: id,
			}),
		]);
		return { id };
	} catch (error) {
		if (isUniqueViolation(error))
			throw clientError(409, m.error_contact_email_taken());
		throw error;
	}
}

export async function updateContact(
	workspaceId: string,
	actor: Actor,
	id: string,
	data: ContactInput,
) {
	const before = await findContact(workspaceId, id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	await assertContactValid(workspaceId, data, before);
	const custom =
		data.custom === undefined
			? before.custom
			: await prepareCustom(
					workspaceId,
					"contact",
					data.custom,
					before.custom,
					id,
				);
	const values = contactRow(data);
	const changes = {
		...changedFields(before, values),
		...customChanges(before.custom, custom),
	};
	if (!Object.keys(changes).length) return { id };
	try {
		await db.batch([
			db
				.update(contact)
				.set({ ...values, custom, updatedAt: new Date() })
				.where(and(eq(contact.id, id), eq(contact.workspaceId, workspaceId))),
			eventInsert(workspaceId, actor, {
				type: "contact.updated",
				subjectType: "contact",
				subjectId: id,
				payload: { changes },
			}),
		]);
		return { id };
	} catch (error) {
		if (isUniqueViolation(error))
			throw clientError(409, m.error_contact_email_taken());
		throw error;
	}
}

export async function setContactArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findContact(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	await db.batch([
		db
			.update(contact)
			.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
			.where(and(eq(contact.id, id), eq(contact.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: archived ? "contact.archived" : "contact.restored",
			subjectType: "contact",
			subjectId: id,
		}),
	]);
	return { id };
}

// Choices for the owner and company pickers
export async function getContactFormOptions(workspaceId: string) {
	const [members, companies] = await Promise.all([
		db
			.select({ id: user.id, name: user.name })
			.from(member)
			.innerJoin(user, eq(user.id, member.userId))
			.where(eq(member.organizationId, workspaceId))
			.orderBy(asc(user.name)),
		db
			.select({ id: company.id, name: company.name })
			.from(company)
			.where(
				and(eq(company.workspaceId, workspaceId), isNull(company.archivedAt)),
			)
			.orderBy(asc(company.name))
			.limit(1000),
	]);
	return { members, companies };
}

// --------------------------------------------------------------- companies

const COMPANY_SORT = {
	name: company.name,
	domain: company.domain,
	createdAt: company.createdAt,
} as const;

function companyRow(data: CompanyInput) {
	return {
		name: data.name,
		domain: data.domain || null,
		phone: data.phone || null,
		city: data.city || null,
		country: data.country || null,
		ownerId: data.ownerId || null,
	};
}

async function assertCompanyValid(
	workspaceId: string,
	data: CompanyInput,
	before?: { id: string; ownerId: string | null },
) {
	const ownerId = data.ownerId || null;
	// An unchanged owner who has since left the workspace doesn't block editing
	await assertWorkspaceRefs(workspaceId, {
		userId: ownerId !== (before?.ownerId ?? null) ? ownerId : null,
	});
	const exceptId = before?.id;
	if (!data.domain) return;
	const conditions = [
		eq(company.workspaceId, workspaceId),
		sql`lower(${company.domain}) = ${data.domain.toLowerCase()}`,
	];
	if (exceptId) conditions.push(ne(company.id, exceptId));
	const [duplicate] = await db
		.select({ id: company.id })
		.from(company)
		.where(and(...conditions))
		.limit(1);
	if (duplicate) throw clientError(409, m.error_company_domain_taken());
}

async function findCompany(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(company)
		.where(and(eq(company.id, id), eq(company.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_company_not_found());
	return row;
}

export async function listCompanies(
	workspaceId: string,
	search: CompanySearch,
) {
	const filters: SQL[] = [
		eq(company.workspaceId, workspaceId),
		search.show === "archived"
			? isNotNull(company.archivedAt)
			: isNull(company.archivedAt),
	];
	if (search.q) {
		const pattern = likePattern(search.q);
		const match = or(
			ilike(company.name, pattern),
			ilike(company.domain, pattern),
			ilike(company.city, pattern),
		);
		if (match) filters.push(match);
	}
	if (search.tag) filters.push(hasTag("company", search.tag));
	const where = and(...filters);
	const column = COMPANY_SORT[search.sort];
	const order = search.dir === "asc" ? asc(column) : desc(column);

	const [rows, [{ total }]] = await Promise.all([
		db
			.select({
				id: company.id,
				name: company.name,
				domain: company.domain,
				city: company.city,
				country: company.country,
				ownerName: ownerNameOf("company"),
				tags: tagsOf("company"),
				contactCount: sql<number>`(select count(*)::int from "contact" c where c."company_id" = "company"."id" and c."workspace_id" = "company"."workspace_id" and c."archived_at" is null)`,
				archivedAt: company.archivedAt,
				createdAt: company.createdAt,
			})
			.from(company)
			.where(where)
			.orderBy(order, asc(company.id))
			.limit(search.pageSize)
			.offset((search.page - 1) * search.pageSize),
		db.select({ total: count() }).from(company).where(where),
	]);
	return page(rows, total, search.pageSize);
}

export async function getCompanyDetail(workspaceId: string, id: string) {
	const row = await findCompany(workspaceId, id);
	const [owner, contacts] = await Promise.all([
		row.ownerId
			? db
					.select({ name: user.name })
					.from(user)
					.where(eq(user.id, row.ownerId))
					.then((r) => r[0]?.name ?? null)
			: null,
		db
			.select({
				id: contact.id,
				firstName: contact.firstName,
				lastName: contact.lastName,
				email: contact.email,
				jobTitle: contact.jobTitle,
				lifecycleStage: contact.lifecycleStage,
			})
			.from(contact)
			.where(
				and(
					eq(contact.workspaceId, workspaceId),
					eq(contact.companyId, id),
					isNull(contact.archivedAt),
				),
			)
			.orderBy(asc(contact.firstName), asc(contact.id))
			.limit(200),
	]);
	return { company: row, ownerName: owner, contacts };
}

export async function createCompany(
	workspaceId: string,
	actor: Actor,
	data: CompanyInput,
) {
	await assertCompanyValid(workspaceId, data);
	const custom = await prepareCustom(workspaceId, "company", data.custom ?? {});
	const id = uuidv7();
	try {
		await db.batch([
			db.insert(company).values({
				id,
				workspaceId,
				createdById: actor.type === "member" ? actor.id : null,
				...companyRow(data),
				custom,
			}),
			eventInsert(workspaceId, actor, {
				type: "company.created",
				subjectType: "company",
				subjectId: id,
			}),
		]);
		return { id };
	} catch (error) {
		if (isUniqueViolation(error))
			throw clientError(409, m.error_company_domain_taken());
		throw error;
	}
}

export async function updateCompany(
	workspaceId: string,
	actor: Actor,
	id: string,
	data: CompanyInput,
) {
	const before = await findCompany(workspaceId, id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	await assertCompanyValid(workspaceId, data, before);
	const custom =
		data.custom === undefined
			? before.custom
			: await prepareCustom(
					workspaceId,
					"company",
					data.custom,
					before.custom,
					id,
				);
	const values = companyRow(data);
	const changes = {
		...changedFields(before, values),
		...customChanges(before.custom, custom),
	};
	if (!Object.keys(changes).length) return { id };
	try {
		await db.batch([
			db
				.update(company)
				.set({ ...values, custom, updatedAt: new Date() })
				.where(and(eq(company.id, id), eq(company.workspaceId, workspaceId))),
			eventInsert(workspaceId, actor, {
				type: "company.updated",
				subjectType: "company",
				subjectId: id,
				payload: { changes },
			}),
		]);
		return { id };
	} catch (error) {
		if (isUniqueViolation(error))
			throw clientError(409, m.error_company_domain_taken());
		throw error;
	}
}

export async function setCompanyArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findCompany(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	await db.batch([
		db
			.update(company)
			.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
			.where(and(eq(company.id, id), eq(company.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: archived ? "company.archived" : "company.restored",
			subjectType: "company",
			subjectId: id,
		}),
	]);
	return { id };
}
