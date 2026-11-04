import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, ne } from "drizzle-orm";
import { db } from "#/db/index";
import { company, contact, event } from "#/db/schema";
import { parseCsv } from "#/modules/csv/csv";
import * as transfer from "#/modules/csv/transfer.server";
import * as fields from "#/modules/fields/fields.server";
import * as records from "#/modules/records/records.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// CSV import and export on real data.
let a: Workspace;
let b: Workspace;
let tierKey = "";

const rows = (csv: string) => parseCsv(csv).slice(1);

async function importText(
	ws: Workspace,
	csv: string,
	options: {
		mode?: "skip" | "update";
		dryRun?: boolean;
		canCreateCompanies?: boolean;
		batch?: number;
	} = {},
) {
	const header = parseCsv(csv)[0];
	const mapping = header.map((h) =>
		h === "Tier"
			? `custom.${tierKey}`
			: ((
					{
						First: "firstName",
						Email: "email",
						Company: "company",
						Stage: "lifecycleStage",
						Owner: "owner",
						Tags: "tags",
						Phone: "phone",
					} as Record<string, string>
				)[h] ?? ""),
	);
	// In batches, like the browser (smaller ones here to cross batch edges)
	const all = rows(csv);
	const size = options.batch ?? 100;
	const total = {
		total: 0,
		created: 0,
		updated: 0,
		skipped: 0,
		errors: [] as { row: number; message: string }[],
	};
	for (let start = 0; start < all.length; start += size) {
		const r = await transfer.importCsv(ws.workspaceId, ws.userId, "contact", {
			rows: all.slice(start, start + size),
			start,
			earlier: all.slice(0, start),
			mapping,
			mode: options.mode ?? "skip",
			dryRun: options.dryRun ?? false,
			canCreateCompanies: options.canCreateCompanies ?? true,
		});
		total.total += r.total;
		total.created += r.created;
		total.updated += r.updated;
		total.skipped += r.skipped;
		total.errors.push(...r.errors);
	}
	return total;
}

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("ia"), createWorkspace("ib")]);
	const tier = await fields.createField(
		a.workspaceId,
		{ type: "member", id: a.userId },
		{
			objectKey: "contact",
			type: "single_choice",
			label: { en: "Tier", es: "Nivel" },
			help: { en: "", es: "" },
			options: [{ value: "gold", label: { en: "Gold", es: "Oro" } }],
			required: false,
			unique: false,
			groupId: "",
		},
	);
	tierKey = tier.key;
});

afterAll(cleanup);

const FILE = [
	"First,Email,Company,Stage,Tier,Tags,Owner",
	"Ana,ana@example.com,Acme,Cliente,Oro,VIP; Madrid,",
	"Ben,ben@example.com,Acme,lead,,,",
	"Cleo,not-an-email,,,,,",
	"Dan,dan@example.com,,,Platinum,,",
	"Eve,ana@example.com,,,,,",
	"Fay,fay@example.com,,,,,someone@elsewhere.com",
].join("\n");

describe("import", () => {
	test("a dry run reports what would happen and writes nothing", async () => {
		const check = await importText(a, FILE, { dryRun: true });
		expect(check).toMatchObject({
			total: 6,
			created: 2,
			updated: 0,
			skipped: 0,
		});
		expect(check.errors.map((e) => e.row)).toEqual([4, 5, 6, 7]);
		const [none] = await db
			.select({ id: contact.id })
			.from(contact)
			.where(
				and(
					eq(contact.workspaceId, a.workspaceId),
					ne(contact.id, a.contactId),
				),
			);
		expect(none).toBeUndefined();
	});

	test("valid rows are created with company, tags, custom values and events; bad rows are skipped", async () => {
		const result = await importText(a, FILE);
		expect(result).toMatchObject({ created: 2, updated: 0 });
		const [ana] = await db
			.select()
			.from(contact)
			.where(
				and(
					eq(contact.workspaceId, a.workspaceId),
					eq(contact.email, "ana@example.com"),
				),
			);
		expect(ana.lifecycleStage).toBe("customer");
		expect(ana.custom[tierKey]).toBe("gold");
		// One "Acme" company, created once and shared by both rows
		const companies = await db
			.select()
			.from(company)
			.where(eq(company.workspaceId, a.workspaceId));
		expect(companies.map((c) => c.name)).toEqual(["Acme"]);
		expect(ana.companyId).toBe(companies[0].id);
		const timeline = await records.getTimeline(
			a.workspaceId,
			"contact",
			ana.id,
		);
		expect(timeline.tags.map((t) => t.name).sort()).toEqual(["Madrid", "VIP"]);
		const [created] = await db
			.select({ payload: event.payload })
			.from(event)
			.where(
				and(eq(event.subjectId, ana.id), eq(event.type, "contact.created")),
			);
		expect(created.payload).toEqual({ source: "import" });
	});

	test("existing records are skipped or updated, as chosen", async () => {
		const again = "First,Email,Phone\nAna,ana@example.com,+34 600 111 222";
		expect(await importText(a, again)).toMatchObject({
			created: 0,
			skipped: 1,
		});
		expect(await importText(a, again, { mode: "update" })).toMatchObject({
			created: 0,
			updated: 1,
		});
		const [ana] = await db
			.select()
			.from(contact)
			.where(
				and(
					eq(contact.workspaceId, a.workspaceId),
					eq(contact.email, "ana@example.com"),
				),
			);
		expect(ana.phone).toBe("+34 600 111 222");
		// Fields missing from the file keep their values
		expect(ana.lifecycleStage).toBe("customer");
		expect(ana.custom[tierKey]).toBe("gold");
	});

	test("another workspace's records don't count as existing", async () => {
		const result = await importText(b, "First,Email\nAna,ana@example.com");
		expect(result).toMatchObject({ created: 1, skipped: 0 });
	});

	test("batches: duplicates across batches, new companies and tags reused", async () => {
		const file = [
			"First,Email,Company,Tags",
			"Gus,gus@example.com,Globex,Batch",
			"Hal,hal@example.com,globex ,batch",
			"Ivy,gus@example.com,,",
		].join("\n");
		const check = await importText(b, file, { dryRun: true, batch: 1 });
		expect(check).toMatchObject({ created: 2 });
		expect(check.errors.map((e) => e.row)).toEqual([4]);
		const result = await importText(b, file, { batch: 1 });
		expect(result).toMatchObject({ created: 2 });
		expect(result.errors.map((e) => e.row)).toEqual([4]);
		const companies = await db
			.select({ name: company.name })
			.from(company)
			.where(eq(company.workspaceId, b.workspaceId));
		expect(companies.map((c) => c.name)).toEqual(["Globex"]);
		const tags = await records.listWorkspaceTags(b.workspaceId);
		expect(tags.map((t) => t.name)).toEqual(["Batch"]);
	});

	test("tag names are checked, and companies need permission to be created", async () => {
		const long = "x".repeat(41);
		const result = await importText(
			b,
			`First,Company,Tags\nJo,,${long}\nKim,Initech,\nLeo,Globex,`,
			{ dryRun: true, canCreateCompanies: false },
		);
		expect(result.created).toBe(1); // Leo: Globex already exists
		expect(result.errors.map((e) => e.row)).toEqual([2, 3]);
	});

	test("a re-imported export loses the formula protection", async () => {
		const result = await importText(b, "First,Phone\nMia,'+34 600 222 333");
		expect(result).toMatchObject({ created: 1, errors: [] });
		const [mia] = await db
			.select({ phone: contact.phone })
			.from(contact)
			.where(
				and(
					eq(contact.workspaceId, b.workspaceId),
					eq(contact.firstName, "Mia"),
				),
			);
		expect(mia.phone).toBe("+34 600 222 333");
	});

	test("unique custom values: taken by another record, free for the same one", async () => {
		const field = await fields.createField(
			b.workspaceId,
			{ type: "member", id: b.userId },
			{
				objectKey: "contact",
				type: "text",
				label: { en: "Member no", es: "Socio" },
				help: { en: "", es: "" },
				options: [],
				required: true,
				unique: true,
				groupId: "",
			},
		);
		const mapping = ["firstName", "email", `custom.${field.key}`];
		const send = (csv: string, mode: "skip" | "update" = "skip") =>
			transfer.importCsv(b.workspaceId, b.userId, "contact", {
				rows: rows(csv),
				start: 0,
				earlier: [],
				mapping,
				mode,
				dryRun: false,
				canCreateCompanies: true,
			});
		expect(await send("First,Email,No\nNed,ned@example.com,A-1")).toMatchObject(
			{
				created: 1,
			},
		);
		const clash = await send("First,Email,No\nOla,ola@example.com,a-1");
		expect(clash.created).toBe(0);
		expect(clash.errors).toHaveLength(1);
		// Ned keeps his own value; an empty required cell leaves it as stored
		expect(
			await send("First,Email,No\nNed,ned@example.com,A-1", "update"),
		).toMatchObject({ updated: 1, errors: [] });
		expect(
			await send("First,Email,No\nNedward,ned@example.com,", "update"),
		).toMatchObject({ updated: 1, errors: [] });
		const [ned] = await db
			.select()
			.from(contact)
			.where(
				and(
					eq(contact.workspaceId, b.workspaceId),
					eq(contact.email, "ned@example.com"),
				),
			);
		expect(ned.firstName).toBe("Nedward");
		expect(ned.custom[field.key]).toBe("A-1");
	});
});

describe("export", () => {
	test("all fields of this workspace's matching records, with readable values", async () => {
		const { csv, rows: count } = await transfer.exportCsv(
			a.workspaceId,
			"contact",
			{
				page: 1,
				pageSize: 10,
				q: "",
				sort: "name",
				dir: "asc",
				show: "active",
				filters: [],
			},
		);
		expect(count).toBe(2);
		const table = parseCsv(csv);
		expect(table[0]).toContain("Tier");
		const ana = table.find((r) => r.includes("ana@example.com"));
		expect(ana).toContain("Acme");
		expect(ana).toContain("Gold");
		expect(ana?.some((c) => c.includes("VIP"))).toBe(true);
		// Workspace B's Ana isn't in A's export
		expect(table.filter((r) => r.includes("ana@example.com"))).toHaveLength(1);
	});
});
