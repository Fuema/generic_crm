import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { contact, event, organization } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import * as fields from "#/modules/fields/fields.server";
import * as portal from "#/modules/portal/portal.server";
import type { PortalProfileInput } from "#/modules/portal/schema";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Customer portal, phase 4 step 2: the contact's profile. Only fields staff
// made visible are shown, only editable ones change; built-in name, phone,
// job title and language are the contact's; email stays with staff; consent
// changes are recorded with source "portal"; every change is an event by the
// contact.
let a: Workspace;
let slug: string;
const actor = () => ({ type: "member" as const, id: a.userId });

let printed: string[] = [];
let spy: ReturnType<typeof spyOn>;
beforeEach(() => {
	printed = [];
	spy = spyOn(console, "info").mockImplementation((...args: unknown[]) => {
		printed.push(args.join(" "));
	});
});
afterEach(() => spy.mockRestore());

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

const field = (
	key: string,
	portalVisibility: "hidden" | "read_only" | "editable",
	required = false,
) =>
	fields.createField(
		a.workspaceId,
		actor(),
		{
			objectKey: "contact",
			type: "text",
			label: { en: key, es: key },
			help: { en: "", es: "" },
			options: [],
			required,
			unique: false,
			groupId: "",
			portalVisibility,
		},
		key,
	);

async function scopeFor(contactId: string) {
	await portal.inviteContact(a.workspaceId, actor(), contactId, "http://x");
	const token = printed
		.join("\n")
		.match(/\/verify\?token=([A-Za-z0-9_-]{43})/)?.[1];
	if (!token) throw new Error("no link printed");
	const { session } = await portal.signIn(slug, token, {
		ip: null,
		userAgent: null,
	});
	const scope = await portal.resolvePortalSession(slug, session);
	if (!scope) throw new Error("no scope");
	return scope;
}

const input = (
	patch: Partial<PortalProfileInput> = {},
): PortalProfileInput => ({
	firstName: "Ana",
	lastName: "Ruiz",
	phone: "",
	jobTitle: "",
	locale: "en",
	marketing: false,
	custom: {},
	...patch,
});

beforeAll(async () => {
	a = await createWorkspace("ppa");
	const [row] = await db
		.select({ slug: organization.slug })
		.from(organization)
		.where(eq(organization.id, a.workspaceId));
	slug = row.slug;
	// Staff fields: an internal note (hidden, required), a customer number
	// shown read-only, and a delivery note the customer may edit
	await field("internal_note", "hidden", true);
	await field("customer_number", "read_only");
	await field("delivery_note", "editable");
});
afterAll(cleanup);

describe("portal profile", () => {
	test("shows only visible fields; saves the contact's changes as theirs", async () => {
		const ana = await contacts.createContact(a.workspaceId, actor(), {
			firstName: "Ana",
			lastName: "Ruiz",
			email: "ana.profile@example.com",
			phone: "",
			jobTitle: "",
			companyId: "",
			ownerId: "",
			lifecycleStage: "customer",
			locale: "en",
			emailConsent: "unknown",
			custom: {
				internal_note: "late payer",
				customer_number: "C-17",
				delivery_note: "",
			},
		});
		const scope = await scopeFor(ana.id);
		const profile = await portal.portalProfile(scope);
		expect(profile.fieldSet.fields.map((f) => f.key).sort()).toEqual([
			"customer_number",
			"delivery_note",
		]);
		expect(profile.custom).toEqual({ customer_number: "C-17" });
		expect(JSON.stringify(profile)).not.toContain("late payer");

		// The contact edits their phone, job title, language and the editable
		// field; the hidden required field doesn't block them
		await portal.updatePortalProfile(
			scope,
			input({
				phone: "+34 600 123 456",
				jobTitle: "Buyer",
				locale: "es",
				custom: { delivery_note: "Ring twice" },
			}),
		);
		const [saved] = await db
			.select()
			.from(contact)
			.where(eq(contact.id, ana.id));
		expect([saved.phone, saved.jobTitle, saved.locale, saved.email]).toEqual([
			"+34 600 123 456",
			"Buyer",
			"es",
			"ana.profile@example.com",
		]);
		expect(saved.custom).toEqual({
			internal_note: "late payer",
			customer_number: "C-17",
			delivery_note: "Ring twice",
		});
		const [e] = await db
			.select()
			.from(event)
			.where(and(eq(event.subjectId, ana.id), eq(event.actorType, "contact")));
		expect([
			e.type,
			e.actorId,
			(e.payload as { source: string }).source,
		]).toEqual(["contact.updated", ana.id, "portal"]);
		// A read-only or hidden field can't be changed from the portal
		for (const custom of [
			{ customer_number: "C-99" },
			{ internal_note: "" },
			{ unknown_key: "x" },
		]) {
			expect(
				await status(portal.updatePortalProfile(scope, input({ custom }))),
			).toBe(400);
		}
	});

	test("marketing consent: unknown until chosen, then recorded from the portal", async () => {
		const ben = await contacts.createContact(a.workspaceId, actor(), {
			firstName: "Ben",
			lastName: "",
			email: "ben.profile@example.com",
			phone: "",
			jobTitle: "",
			companyId: "",
			ownerId: "",
			lifecycleStage: "customer",
			locale: "en",
			emailConsent: "unknown",
			custom: { internal_note: "staff only" },
		});
		const scope = await scopeFor(ben.id);
		const consent = async () =>
			(
				await db
					.select({
						consent: contact.emailConsent,
						source: contact.emailConsentSource,
					})
					.from(contact)
					.where(eq(contact.id, ben.id))
			)[0];
		await portal.updatePortalProfile(
			scope,
			input({ firstName: "Ben", lastName: "" }),
		);
		expect((await consent()).consent).toBe("unknown");
		await portal.updatePortalProfile(
			scope,
			input({ firstName: "Ben", lastName: "", marketing: true }),
		);
		expect(await consent()).toEqual({ consent: "granted", source: "portal" });
		await portal.updatePortalProfile(
			scope,
			input({ firstName: "Ben", lastName: "", marketing: false }),
		);
		expect((await consent()).consent).toBe("revoked");
	});

	test("review fixes: language kept, omitted fields kept, unique never editable", async () => {
		const dee = await contacts.createContact(a.workspaceId, actor(), {
			firstName: "Dee",
			lastName: "",
			email: "dee.profile@example.com",
			phone: "",
			jobTitle: "",
			companyId: "",
			ownerId: "",
			lifecycleStage: "customer",
			locale: "",
			emailConsent: "unknown",
			custom: { internal_note: "x", delivery_note: "Back door" },
		});
		const scope = await scopeFor(dee.id);
		const read = async () =>
			(await db.select().from(contact).where(eq(contact.id, dee.id)))[0];
		// An unset language stays unset; an omitted editable field keeps its value
		await portal.updatePortalProfile(
			scope,
			input({
				firstName: "Dee",
				lastName: "",
				locale: "",
				phone: "600 123 456",
			}),
		);
		const saved = await read();
		expect([saved.locale, saved.custom.delivery_note]).toEqual([
			null,
			"Back door",
		]);
		// "Editable" is refused for unique fields and for other record types
		const unique = {
			objectKey: "contact" as const,
			type: "text" as const,
			label: { en: "Tax id", es: "NIF" },
			help: { en: "", es: "" },
			options: [],
			required: false,
			unique: true,
			groupId: "",
			portalVisibility: "editable" as const,
		};
		expect(
			await status(fields.createField(a.workspaceId, actor(), unique)),
		).toBe(400);
		expect(
			await status(
				fields.createField(a.workspaceId, actor(), {
					...unique,
					objectKey: "deal",
					unique: false,
				}),
			),
		).toBe(400);
	});

	test("an archived contact can't read or change their profile", async () => {
		const cy = await contacts.createContact(a.workspaceId, actor(), {
			firstName: "Cy",
			lastName: "",
			email: "cy.profile@example.com",
			phone: "",
			jobTitle: "",
			companyId: "",
			ownerId: "",
			lifecycleStage: "customer",
			locale: "en",
			emailConsent: "unknown",
			custom: { internal_note: "staff only" },
		});
		const scope = await scopeFor(cy.id);
		await contacts.setContactArchived(a.workspaceId, actor(), cy.id, true);
		expect(
			await status(
				portal.updatePortalProfile(scope, input({ firstName: "X" })),
			),
		).toBe(401);
	});
});
