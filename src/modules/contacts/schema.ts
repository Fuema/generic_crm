import { z } from "zod";
import { COUNTRY_CODES } from "#/lib/countries";
import { listSearchSchema } from "#/lib/schema";
import { m } from "#/paraglide/messages.js";

// Shared by the forms (client) and the server functions. Messages are functions
// so they resolve in the language of the page or request doing the check.

export const LIFECYCLE_STAGES = [
	"subscriber",
	"lead",
	"qualified",
	"customer",
	"inactive",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const EMAIL_CONSENTS = ["unknown", "granted", "revoked"] as const;
export type EmailConsent = (typeof EMAIL_CONSENTS)[number];

// Fixed set (spec decision): businesses may rename stages later, not add them
export const STAGE_LABELS: Record<LifecycleStage, () => string> = {
	subscriber: m.stage_subscriber,
	lead: m.stage_lead,
	qualified: m.stage_qualified,
	customer: m.stage_customer,
	inactive: m.stage_inactive,
};

export const CONSENT_LABELS: Record<EmailConsent, () => string> = {
	unknown: m.consent_unknown,
	granted: m.consent_granted,
	revoked: m.consent_revoked,
};

const text = (max: number) =>
	z
		.string()
		.trim()
		.max(max, { error: () => m.validation_text_max({ max }) });

// Empty, or 7–15 digits with optional +, spaces, dots, dashes and parentheses
const phone = text(25).refine(
	(v) =>
		v === "" ||
		(/^\+?[\d\s().-]+$/.test(v) &&
			(v.match(/\d/g)?.length ?? 0) >= 7 &&
			(v.match(/\d/g)?.length ?? 0) <= 15),
	{ error: () => m.validation_phone() },
);

const optionalEmail = z
	.string()
	.trim()
	.toLowerCase()
	.max(254, { error: () => m.validation_email_max() })
	.refine((v) => v === "" || z.email().safeParse(v).success, {
		error: () => m.validation_email_invalid(),
	});

// "" or the id of a record in this workspace (the server checks the workspace)
const optionalId = z.union([
	z.literal(""),
	z.uuid({ error: () => m.validation_invalid_id() }),
]);
// Better Auth user ids are opaque strings
const optionalUserId = z
	.string()
	.max(64, { error: () => m.validation_invalid_id() });

const country = z
	.string()
	.refine((v) => v === "" || COUNTRY_CODES.includes(v), {
		error: () => m.validation_choose_country(),
	});

// Custom values as sent by the form; the server checks them against the
// field definitions (prepareCustom). Omitted on update = keep the stored values.
const customInput = z
	.record(z.string().max(40), z.unknown())
	.refine((r) => Object.keys(r).length <= 100)
	.optional();

export const contactInputSchema = z.object({
	firstName: z
		.string()
		.trim()
		.min(1, { error: () => m.validation_first_name_required() })
		.max(100, { error: () => m.validation_text_max({ max: 100 }) }),
	lastName: text(100),
	email: optionalEmail,
	phone,
	jobTitle: text(100),
	companyId: optionalId,
	ownerId: optionalUserId,
	lifecycleStage: z.enum(LIFECYCLE_STAGES),
	locale: z.enum(["", "en", "es"]),
	emailConsent: z.enum(EMAIL_CONSENTS),
	custom: customInput,
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const companyInputSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, { error: () => m.validation_company_name_required() })
		.max(100, { error: () => m.validation_text_max({ max: 100 }) }),
	domain: z
		.string()
		.trim()
		.toLowerCase()
		.max(253, { error: () => m.validation_domain() })
		.refine(
			(v) =>
				v === "" ||
				/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
					v,
				),
			{ error: () => m.validation_domain() },
		),
	phone,
	city: text(100),
	country,
	ownerId: optionalUserId,
	custom: customInput,
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const idSchema = z.object({
	id: z.uuid({ error: () => m.validation_invalid_id() }),
});

const archivedFilter = z
	.enum(["active", "archived"])
	.catch("active")
	.default("active");

export const contactSearchSchema = listSearchSchema(
	LIFECYCLE_STAGES,
	["name", "email", "lifecycleStage", "createdAt"],
	"createdAt",
).extend({
	show: archivedFilter,
	company: z.uuid().optional().catch(undefined),
	tag: z.uuid().optional().catch(undefined),
});
export type ContactSearch = z.infer<typeof contactSearchSchema>;

export const companySearchSchema = listSearchSchema(
	["active"],
	["name", "domain", "createdAt"],
	"name",
	"asc",
).extend({
	show: archivedFilter,
	tag: z.uuid().optional().catch(undefined),
});
export type CompanySearch = z.infer<typeof companySearchSchema>;

export function contactName(c: { firstName: string; lastName: string | null }) {
	return [c.firstName, c.lastName].filter(Boolean).join(" ");
}
