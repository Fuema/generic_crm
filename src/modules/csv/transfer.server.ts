import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "#/db/index";
import {
	company,
	contact,
	event,
	member,
	recordTag,
	tag,
	user,
} from "#/db/schema";
import { COUNTRY_CODES, countryName } from "#/lib/countries";
import * as contacts from "#/modules/contacts/contacts.server";
import {
	CONSENT_LABELS,
	type CompanySearch,
	type ContactSearch,
	companyInputSchema,
	contactInputSchema,
	type EmailConsent,
	type LifecycleStage,
	STAGE_LABELS,
} from "#/modules/contacts/schema";
import { customChanges, listFields } from "#/modules/fields/fields.server";
import {
	type FieldDef,
	localized,
	validateCustomValues,
} from "#/modules/fields/schema";
import { colorFor } from "#/modules/records/records.server";
import {
	LIMITS as RECORD_LIMITS,
	tagNameSchema,
} from "#/modules/records/schema";
import { m } from "#/paraglide/messages.js";
import { changedFields } from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import type { Json } from "#/platform/json";
import {
	type CsvObjectKey,
	consentFromText,
	customFromText,
	customToText,
	IMPORT_FIELDS,
	normalize,
	stageFromText,
} from "./columns";
import { CSV_LIMITS, toCsv } from "./csv";

// Server-only CSV export and import for contacts and companies. Workspace id
// first. The browser sends an import in batches of CSV_LIMITS.importBatch rows
// (Workers free plan: 50 subrequests and little CPU per request). Each batch
// is checked with the same rules as the forms, then written in one db.batch:
// a batch is imported completely or not at all.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

// Unique (23505) or foreign key (23503) violation: something the batch relies
// on was created or deleted by someone else after it was checked
function isConflict(error: unknown) {
	const e = error as { code?: string; cause?: { code?: string } };
	const code = e?.code ?? e?.cause?.code;
	return code === "23505" || code === "23503";
}

const MAX_ERRORS = 100;

// ------------------------------------------------------------------ export

export async function exportCsv(
	workspaceId: string,
	objectKey: CsvObjectKey,
	search: ContactSearch | CompanySearch,
) {
	if (objectKey === "contact") {
		const { rows, fields } = await contacts.exportContactRows(
			workspaceId,
			search as ContactSearch,
			CSV_LIMITS.exportRows,
		);
		const custom = fields.filter((f) => !f.archivedAt);
		const header = [
			...IMPORT_FIELDS.contact.map((f) => f.label()),
			m.contacts_col_added(),
			...custom.map((f) => localized(f.label)),
		];
		const body = rows.map((r) => [
			r.firstName,
			r.lastName,
			r.email,
			r.phone,
			r.jobTitle,
			r.companyName,
			STAGE_LABELS[r.lifecycleStage as LifecycleStage]?.() ?? r.lifecycleStage,
			r.ownerEmail,
			r.locale,
			CONSENT_LABELS[r.emailConsent as EmailConsent]?.() ?? r.emailConsent,
			r.tags.map((t) => t.name).join("; "),
			new Date(r.createdAt).toISOString().slice(0, 10),
			...custom.map((f) =>
				customToText(
					f,
					Object.hasOwn(r.custom, f.key) ? r.custom[f.key] : undefined,
				),
			),
		]);
		return { csv: toCsv([header, ...body]), rows: rows.length };
	}
	const { rows, fields } = await contacts.exportCompanyRows(
		workspaceId,
		search as CompanySearch,
		CSV_LIMITS.exportRows,
	);
	const custom = fields.filter((f) => !f.archivedAt);
	const header = [
		...IMPORT_FIELDS.company.map((f) => f.label()),
		m.contacts_col_added(),
		...custom.map((f) => localized(f.label)),
	];
	const body = rows.map((r) => [
		r.name,
		r.domain,
		r.phone,
		r.city,
		r.country ? countryName(r.country) : "",
		r.ownerEmail,
		r.tags.map((t) => t.name).join("; "),
		new Date(r.createdAt).toISOString().slice(0, 10),
		...custom.map((f) =>
			customToText(
				f,
				Object.hasOwn(r.custom, f.key) ? r.custom[f.key] : undefined,
			),
		),
	]);
	return { csv: toCsv([header, ...body]), rows: rows.length };
}

// ------------------------------------------------------------------ import

export type ImportInput = {
	// This batch of rows, and the position of its first row in the file
	rows: string[][];
	start: number;
	// The rows before this batch: only their email/domain and unique custom
	// values are read, to find duplicates inside the file
	earlier: string[][];
	mapping: string[];
	mode: "skip" | "update";
	dryRun: boolean;
	// Contacts can name a company that doesn't exist yet
	canCreateCompanies: boolean;
};

type Existing = Record<string, unknown> & {
	id: string;
	archivedAt: Date | null;
	custom: Record<string, Json>;
};

type PlannedRow = {
	row: number;
	existing?: Existing;
	input: Record<string, unknown>;
	custom: Record<string, Json>;
	tagIds: string[];
	// Contacts: the company's id, or undefined when the file leaves it empty
	companyId?: string;
	// Fields with a non-empty cell: an update changes only these
	provided: Set<string>;
};

export type ImportResult = {
	total: number;
	created: number;
	updated: number;
	skipped: number;
	errors: { row: number; message: string }[];
};

// Import field id -> table column, where they differ
const COLUMN_OF: Record<string, string> = {
	company: "companyId",
	owner: "ownerId",
};

function localeFromText(text: string) {
	const t = normalize(text);
	if (["en", "english", "ingles"].includes(t)) return "en";
	if (["es", "spanish", "espanol", "castellano"].includes(t)) return "es";
	return t ? null : "";
}

// Country names in English and Spanish -> code, built once per server instance
let countryIndex: Map<string, string> | undefined;
function countryFromText(text: string) {
	const t = text.trim();
	if (!t) return "";
	if (COUNTRY_CODES.includes(t.toUpperCase())) return t.toUpperCase();
	if (!countryIndex) {
		countryIndex = new Map();
		for (const c of COUNTRY_CODES) {
			countryIndex.set(normalize(countryName(c, "en")), c);
			countryIndex.set(normalize(countryName(c, "es")), c);
		}
	}
	return countryIndex.get(normalize(t)) ?? null;
}

// The value of each mapped field. A cell exported with a leading ' (formula
// protection, see toCsv) comes back without it.
function cellReader(row: string[], mapping: string[]) {
	const values = new Map<string, string>();
	mapping.forEach((field, i) => {
		if (!field || values.has(field)) return;
		const text = (row[i] ?? "").trim();
		values.set(field, /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text);
	});
	return values;
}

function rowKeys(
	v: Map<string, string>,
	objectKey: CsvObjectKey,
	uniqueDefs: FieldDef[],
) {
	const dedupe = (
		v.get(objectKey === "contact" ? "email" : "domain") ?? ""
	).toLowerCase();
	const unique = uniqueDefs.map((d) => {
		const text = v.get(`custom.${d.key}`);
		const value = text ? customFromText(d, text) : undefined;
		return [d.key, typeof value === "string" ? value.toLowerCase() : ""];
	});
	return { dedupe, unique };
}

function tagNamesFromText(text: string) {
	const names = new Map<string, string>();
	for (const raw of text.split(/[;,|]/)) {
		if (!raw.trim()) continue;
		const parsed = tagNameSchema.safeParse(raw);
		if (!parsed.success)
			return { error: parsed.error.issues[0]?.message ?? m.error_generic() };
		names.set(parsed.data.toLowerCase(), parsed.data);
	}
	return { names: [...names.values()] };
}

async function memberEmails(workspaceId: string) {
	const rows = await db
		.select({ id: user.id, email: user.email })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, workspaceId));
	return new Map(rows.map((r) => [r.email.toLowerCase(), r.id]));
}

// Records of this workspace already using one of the batch's values of each
// unique custom field, in one query: per field, lowercased value -> record id
async function uniqueHolders(
	workspaceId: string,
	objectKey: CsvObjectKey,
	wanted: { key: string; values: string[] }[],
) {
	const holders = wanted.map(() => new Map<string, string>());
	const asked = wanted.filter((w) => w.values.length);
	if (!asked.length) return holders;
	const table = objectKey === "contact" ? contact : company;
	const rows = await db
		.select({ id: table.id, custom: table.custom })
		.from(table)
		.where(
			and(
				eq(table.workspaceId, workspaceId),
				or(
					...asked.map((w) =>
						inArray(sql`lower(${table.custom} ->> ${w.key})`, w.values),
					),
				),
			),
		);
	for (const r of rows) {
		wanted.forEach((w, i) => {
			const value = Object.hasOwn(r.custom, w.key) ? r.custom[w.key] : null;
			if (typeof value === "string") holders[i].set(value.toLowerCase(), r.id);
		});
	}
	return holders;
}

async function existingRecords(
	workspaceId: string,
	objectKey: CsvObjectKey,
	keys: string[],
) {
	if (!keys.length) return new Map<string, Existing>();
	const rows = (
		objectKey === "contact"
			? await db
					.select()
					.from(contact)
					.where(
						and(
							eq(contact.workspaceId, workspaceId),
							inArray(sql`lower(${contact.email})`, keys),
						),
					)
			: await db
					.select()
					.from(company)
					.where(
						and(
							eq(company.workspaceId, workspaceId),
							inArray(sql`lower(${company.domain})`, keys),
						),
					)
	) as Existing[];
	const keyOf = (r: Existing) =>
		String((objectKey === "contact" ? r.email : r.domain) ?? "").toLowerCase();
	return new Map(rows.map((r) => [keyOf(r), r]));
}

// Checks every row of the batch and decides what to do with it; nothing is
// written here
async function planImport(
	workspaceId: string,
	objectKey: CsvObjectKey,
	input: ImportInput,
) {
	const { fields: defs } = await listFields(workspaceId, objectKey, {
		includeArchived: false,
	});
	const uniqueDefs = defs.filter((d) => d.unique && !d.archivedAt);
	const batch = input.rows.map((cells, i) => ({
		row: input.start + i + 2, // the header is row 1
		v: cellReader(cells, input.mapping),
	}));

	// Values already used by earlier rows of the file
	const seenKeys = new Set<string>();
	const seenUnique = new Map(uniqueDefs.map((d) => [d.key, new Set<string>()]));
	for (const cells of input.earlier) {
		const k = rowKeys(cellReader(cells, input.mapping), objectKey, uniqueDefs);
		if (k.dedupe) seenKeys.add(k.dedupe);
		for (const [key, value] of k.unique)
			if (value) seenUnique.get(key)?.add(value);
	}

	// What this batch refers to, loaded in a few queries
	const batchKeys = batch.map((b) => rowKeys(b.v, objectKey, uniqueDefs));
	const companyNames = [
		...new Set(
			batch
				.map((b) => (b.v.get("company") ?? "").toLowerCase())
				.filter(Boolean),
		),
	];
	const [owners, existing, holders, companies, tags] = await Promise.all([
		memberEmails(workspaceId),
		existingRecords(workspaceId, objectKey, [
			...new Set(batchKeys.map((k) => k.dedupe).filter(Boolean)),
		]),
		uniqueHolders(
			workspaceId,
			objectKey,
			uniqueDefs.map((d, i) => ({
				key: d.key,
				values: [
					...new Set(batchKeys.map((k) => k.unique[i][1]).filter(Boolean)),
				],
			})),
		),
		objectKey === "contact" && companyNames.length
			? db
					.select({ id: company.id, name: company.name })
					.from(company)
					.where(
						and(
							eq(company.workspaceId, workspaceId),
							isNull(company.archivedAt),
							inArray(sql`lower(${company.name})`, companyNames),
						),
					)
			: Promise.resolve([]),
		db
			.select({ id: tag.id, name: tag.name })
			.from(tag)
			.where(eq(tag.workspaceId, workspaceId)),
	]);
	// Tags already on the records this batch updates
	const updateIds = [...existing.values()].map((r) => r.id);
	const currentTags = new Map<string, Set<string>>();
	if (
		input.mode === "update" &&
		updateIds.length &&
		input.mapping.includes("tags")
	) {
		const links = await db
			.select({ subjectId: recordTag.subjectId, tagId: recordTag.tagId })
			.from(recordTag)
			.where(
				and(
					eq(recordTag.workspaceId, workspaceId),
					eq(recordTag.subjectType, objectKey),
					inArray(recordTag.subjectId, updateIds),
				),
			);
		for (const l of links) {
			const set = currentTags.get(l.subjectId) ?? new Set();
			set.add(l.tagId);
			currentTags.set(l.subjectId, set);
		}
	}

	const companyIds = new Map(companies.map((c) => [normalize(c.name), c.id]));
	const tagIds = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));
	let tagCount = tags.length;
	const newCompanies: { id: string; name: string }[] = [];
	const newTags: { id: string; name: string }[] = [];
	const planned: PlannedRow[] = [];
	const errors: ImportResult["errors"] = [];
	let skipped = 0;

	const planRow = ({ row, v }: (typeof batch)[number], index: number) => {
		const fail = (message: string) => {
			if (errors.length < MAX_ERRORS) errors.push({ row, message });
		};
		const keys = batchKeys[index];

		// Duplicates inside the file: the first row with a value wins
		if (keys.dedupe) {
			if (seenKeys.has(keys.dedupe))
				return fail(m.import_error_duplicate_in_file({ value: keys.dedupe }));
			seenKeys.add(keys.dedupe);
		}
		for (const [key, value] of keys.unique) {
			const seen = seenUnique.get(key);
			if (!value || !seen) continue;
			if (seen.has(value))
				return fail(m.import_error_duplicate_in_file({ value }));
			seen.add(value);
		}

		// Owner by member email
		const ownerText = v.get("owner") ?? "";
		const ownerId = ownerText ? owners.get(ownerText.toLowerCase()) : "";
		if (ownerId === undefined)
			return fail(m.import_error_owner({ email: ownerText }));

		let base: Record<string, unknown>;
		if (objectKey === "contact") {
			const stageText = v.get("lifecycleStage") ?? "";
			const stage = stageText ? stageFromText(stageText) : "lead";
			if (!stage) return fail(m.import_error_option({ value: stageText }));
			const consentText = v.get("emailConsent") ?? "";
			const consent = consentText ? consentFromText(consentText) : "unknown";
			if (!consent) return fail(m.import_error_option({ value: consentText }));
			const locale = localeFromText(v.get("locale") ?? "");
			if (locale === null)
				return fail(m.import_error_option({ value: v.get("locale") ?? "" }));
			const parsed = contactInputSchema.safeParse({
				firstName: v.get("firstName") ?? "",
				lastName: v.get("lastName") ?? "",
				email: v.get("email") ?? "",
				phone: v.get("phone") ?? "",
				jobTitle: v.get("jobTitle") ?? "",
				companyId: "",
				ownerId,
				lifecycleStage: stage,
				locale,
				emailConsent: consent,
			});
			if (!parsed.success)
				return fail(parsed.error.issues[0]?.message ?? m.error_generic());
			base = parsed.data;
		} else {
			const country = countryFromText(v.get("country") ?? "");
			if (country === null) return fail(m.validation_choose_country());
			const parsed = companyInputSchema.safeParse({
				name: v.get("name") ?? "",
				domain: v.get("domain") ?? "",
				phone: v.get("phone") ?? "",
				city: v.get("city") ?? "",
				country,
				ownerId,
			});
			if (!parsed.success)
				return fail(parsed.error.issues[0]?.message ?? m.error_generic());
			base = parsed.data;
		}

		// Existing record (same email or domain, archived ones too)
		const found = keys.dedupe ? existing.get(keys.dedupe) : undefined;
		if (found && input.mode === "skip") {
			skipped += 1;
			return;
		}
		if (found?.archivedAt) return fail(m.error_record_archived());

		// Custom values with the shared rules. A required field the file leaves
		// out is fine when the stored record already has it.
		const customInput: Record<string, unknown> = {};
		for (const d of defs) {
			const text = v.get(`custom.${d.key}`);
			if (text !== undefined) customInput[d.key] = customFromText(d, text);
		}
		const checkedDefs = defs.filter(
			(d) =>
				Boolean(v.get(`custom.${d.key}`)) ||
				(d.required && !(found && Object.hasOwn(found.custom, d.key))),
		);
		const { values, errors: customErrors } = validateCustomValues(
			checkedDefs,
			customInput,
		);
		const firstCustomError = Object.values(customErrors)[0];
		if (firstCustomError) return fail(firstCustomError);
		for (const [i, d] of uniqueDefs.entries()) {
			const value = values[d.key];
			if (typeof value !== "string") continue;
			const holder = holders[i].get(value.toLowerCase());
			if (holder && holder !== found?.id)
				return fail(m.error_custom_unique({ field: localized(d.label) }));
		}

		// Tags: valid names, within the per-record and per-workspace limits
		const tagResult = tagNamesFromText(v.get("tags") ?? "");
		if (tagResult.error) return fail(tagResult.error);
		const names = tagResult.names ?? [];
		const current = found
			? (currentTags.get(found.id) ?? new Set())
			: new Set();
		const addedNames = names.filter((n) => {
			const id = tagIds.get(n.toLowerCase());
			return !id || !current.has(id);
		});
		if (current.size + addedNames.length > RECORD_LIMITS.tagsPerRecord)
			return fail(
				m.error_tag_record_limit({ max: RECORD_LIMITS.tagsPerRecord }),
			);
		const unknownNames = addedNames.filter((n) => !tagIds.has(n.toLowerCase()));
		if (tagCount + unknownNames.length > RECORD_LIMITS.tagsPerWorkspace)
			return fail(
				m.error_tag_workspace_limit({ max: RECORD_LIMITS.tagsPerWorkspace }),
			);

		// Company named by a contact: an existing one by name, or a new one
		const companyName = objectKey === "contact" ? v.get("company") : "";
		let companyId: string | undefined;
		let newCompany: { id: string; name: string } | undefined;
		if (companyName) {
			companyId = companyIds.get(normalize(companyName));
			if (!companyId) {
				if (!input.canCreateCompanies)
					return fail(m.import_error_company({ name: companyName }));
				if (companyName.length > 100)
					return fail(m.validation_text_max({ max: 100 }));
				newCompany = { id: uuidv7(), name: companyName };
				companyId = newCompany.id;
			}
		}

		// The row is accepted: register what it creates for the next rows
		if (newCompany) {
			newCompanies.push(newCompany);
			companyIds.set(normalize(newCompany.name), newCompany.id);
		}
		for (const name of unknownNames) {
			const created = { id: uuidv7(), name };
			newTags.push(created);
			tagIds.set(name.toLowerCase(), created.id);
			tagCount += 1;
		}
		planned.push({
			row,
			existing: found,
			input: base,
			custom: values as Record<string, Json>,
			tagIds: addedNames.map((n) => tagIds.get(n.toLowerCase()) as string),
			companyId,
			provided: new Set(
				[...v].filter(([, value]) => value !== "").map(([field]) => field),
			),
		});
	};
	batch.forEach((b, index) => {
		planRow(b, index);
	});
	const tagNames = new Map(
		[...tags, ...newTags].map((t) => [t.id, t.name] as const),
	);
	return { planned, errors, skipped, newCompanies, newTags, tagNames };
}

// Table columns of a checked row
function columnsOf(
	objectKey: CsvObjectKey,
	i: Record<string, unknown>,
	companyId: string | null,
): Record<string, unknown> {
	const text = (key: string) => (i[key] as string) || null;
	return objectKey === "contact"
		? {
				firstName: i.firstName,
				lastName: text("lastName"),
				email: text("email"),
				phone: text("phone"),
				jobTitle: text("jobTitle"),
				companyId,
				ownerId: text("ownerId"),
				lifecycleStage: i.lifecycleStage,
				locale: text("locale"),
				emailConsent: i.emailConsent,
			}
		: {
				name: i.name,
				domain: text("domain"),
				phone: text("phone"),
				city: text("city"),
				country: text("country"),
				ownerId: text("ownerId"),
			};
}

export async function importCsv(
	workspaceId: string,
	userId: string,
	objectKey: CsvObjectKey,
	input: ImportInput,
): Promise<ImportResult> {
	if (
		input.rows.length > CSV_LIMITS.importBatch ||
		input.start + input.rows.length > CSV_LIMITS.importRows
	) {
		throw clientError(
			400,
			m.import_error_too_many({ max: CSV_LIMITS.importRows }),
		);
	}
	const { planned, errors, skipped, newCompanies, newTags, tagNames } =
		await planImport(workspaceId, objectKey, input);
	const result: ImportResult = {
		total: input.rows.length,
		created: planned.filter((p) => !p.existing).length,
		updated: planned.filter((p) => p.existing).length,
		skipped,
		errors,
	};
	if (input.dryRun || planned.length === 0) return result;

	const table = objectKey === "contact" ? contact : company;
	const now = new Date();
	const eventRow = (
		type: string,
		subjectType: string,
		subjectId: string,
		payload: Record<string, Json>,
	) => ({
		id: uuidv7(),
		workspaceId,
		type,
		subjectType,
		subjectId,
		actorType: "member",
		actorId: userId,
		payload,
	});

	// Statements for one db.batch (one transaction)
	const queries: unknown[] = [];
	if (newCompanies.length) {
		queries.push(
			db.insert(company).values(
				newCompanies.map((c) => ({
					id: c.id,
					workspaceId,
					name: c.name,
					createdById: userId,
				})),
			),
			db
				.insert(event)
				.values(
					newCompanies.map((c) =>
						eventRow("company.created", "company", c.id, { source: "import" }),
					),
				),
		);
	}
	// A tag created at the same moment by someone else fails the batch (unique
	// name), which is reported below instead of linking a missing tag
	if (newTags.length) {
		queries.push(
			db.insert(tag).values(
				newTags.map((t) => ({
					id: t.id,
					workspaceId,
					name: t.name,
					color: colorFor(t.name),
				})),
			),
		);
	}

	const creates = planned
		.filter((p) => !p.existing)
		.map((p) => ({ ...p, id: uuidv7() }));
	if (creates.length) {
		queries.push(
			db.insert(table).values(
				creates.map((p) => ({
					...columnsOf(objectKey, p.input, p.companyId ?? null),
					id: p.id,
					workspaceId,
					createdById: userId,
					custom: p.custom,
				})) as never,
			),
			db.insert(event).values(
				creates.map((p) =>
					eventRow(`${objectKey}.created`, objectKey, p.id, {
						source: "import",
					}),
				),
			),
		);
	}

	// Updates: only the fields with a value in the file, over the stored ones
	const updates = planned.filter(
		(p): p is PlannedRow & { existing: Existing } => Boolean(p.existing),
	);
	for (const p of updates) {
		const before = p.existing;
		const all = columnsOf(objectKey, p.input, p.companyId ?? null);
		const provided = new Set([...p.provided].map((f) => COLUMN_OF[f] ?? f));
		const values = Object.fromEntries(
			Object.entries(all).filter(([column]) => provided.has(column)),
		);
		const custom = { ...before.custom, ...p.custom };
		const changes = {
			...changedFields(before, values),
			...customChanges(before.custom, custom),
		};
		if (!Object.keys(changes).length) continue;
		// Custom values merge in SQL, so a concurrent edit of other custom
		// fields isn't lost; a record archived meanwhile is left alone
		queries.push(
			db
				.update(table)
				.set({
					...values,
					custom: sql`${table.custom} || ${JSON.stringify(p.custom)}::jsonb`,
					updatedAt: now,
				})
				.where(
					and(
						eq(table.id, before.id),
						eq(table.workspaceId, workspaceId),
						isNull(table.archivedAt),
					),
				),
			db
				.insert(event)
				.values(
					eventRow(`${objectKey}.updated`, objectKey, before.id, { changes }),
				),
		);
	}

	// Tag links, new and updated records alike
	const links = [
		...creates.map((p) => ({ id: p.id, tagIds: p.tagIds })),
		...updates.map((p) => ({ id: p.existing.id, tagIds: p.tagIds })),
	].flatMap((r) => r.tagIds.map((tagId) => ({ recordId: r.id, tagId })));
	if (links.length) {
		queries.push(
			db.insert(recordTag).values(
				links.map((l) => ({
					workspaceId,
					tagId: l.tagId,
					subjectType: objectKey,
					subjectId: l.recordId,
					createdById: userId,
				})),
			),
			db.insert(event).values(
				links.map((l) =>
					eventRow(`${objectKey}.tag_added`, objectKey, l.recordId, {
						tagId: l.tagId,
						name: tagNames.get(l.tagId) ?? "",
					}),
				),
			),
		);
	}

	if (!queries.length) return result;
	try {
		await db.batch(queries as unknown as Parameters<typeof db.batch>[0]);
	} catch (error) {
		if (!isConflict(error)) {
			console.error("CSV import batch failed", error);
			throw clientError(500, m.error_generic());
		}
		// Someone changed the same records meanwhile: nothing of this batch was
		// written; its rows are reported so they can be imported again
		for (const p of planned) {
			if (result.errors.length < MAX_ERRORS)
				result.errors.push({ row: p.row, message: m.import_error_conflict() });
		}
		result.created = 0;
		result.updated = 0;
		result.errors.sort((a, b) => a.row - b.row);
	}
	return result;
}
