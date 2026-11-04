import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as deals from "#/modules/deals/deals.server";
import * as pipelines from "#/modules/pipelines/pipelines.server";
import * as projects from "#/modules/projects/projects.server";
import type { ProjectInput } from "#/modules/projects/schema";
import * as records from "#/modules/records/records.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Projects (phase 3 step 1): create and edit, status events, "Create project"
// from a won deal (once), merge, the contact timeline, and isolation.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });

const person = (firstName: string): ContactInput => ({
	firstName,
	lastName: "",
	email: "",
	phone: "",
	jobTitle: "",
	companyId: "",
	ownerId: "",
	lifecycleStage: "lead",
	locale: "en",
	emailConsent: "unknown",
});

const input = (patch: Partial<ProjectInput> = {}): ProjectInput => ({
	name: "Website",
	description: "",
	status: "planned",
	startDate: "",
	dueDate: "",
	ownerId: "",
	contactId: "",
	companyId: "",
	...patch,
});

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

let contactA: string;
beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("pja"), createWorkspace("pjb")]);
	contactA = (
		await contacts.createContact(a.workspaceId, actorA(), person("Ana"))
	).id;
});
afterAll(cleanup);

describe("projects", () => {
	test("create and edit; a status change writes its own event", async () => {
		const { id } = await projects.createProject(
			a.workspaceId,
			actorA(),
			input({ contactId: contactA }),
		);
		await projects.updateProject(
			a.workspaceId,
			actorA(),
			id,
			input({ contactId: contactA, status: "active", dueDate: "2026-12-31" }),
		);
		const { project: p } = await projects.getProjectDetail(a.workspaceId, id);
		expect([p.status, p.dueDate?.toISOString()]).toEqual([
			"active",
			"2026-12-31T12:00:00.000Z",
		]);
		const types = (
			await db
				.select({ type: event.type })
				.from(event)
				.where(and(eq(event.subjectType, "project"), eq(event.subjectId, id)))
		).map((e) => e.type);
		expect(types.sort()).toEqual(["project.created", "project.status_changed"]);
		// It shows on the contact's timeline
		const timeline = await records.getTimeline(
			a.workspaceId,
			"contact",
			contactA,
		);
		expect(timeline.events.map((e) => e.type)).toContain(
			"project.status_changed",
		);
	});

	test("a won deal becomes a project once, with its name, contact and company", async () => {
		const pl = await pipelines.createPipeline(a.workspaceId, actorA(), {
			name: { en: "P", es: "" },
			stages: [
				{ id: "", name: { en: "New", es: "" }, probability: 10, type: "open" },
				{ id: "", name: { en: "Won", es: "" }, probability: 100, type: "won" },
				{ id: "", name: { en: "Lost", es: "" }, probability: 0, type: "lost" },
			],
		});
		const [found] = (
			await pipelines.listPipelines(a.workspaceId, { includeArchived: false })
		).filter((x) => x.id === pl.id);
		const d = await deals.createDeal(a.workspaceId, actorA(), {
			name: "Shop build",
			pipelineId: pl.id,
			stageId: found.stages[0].id,
			valueCents: 0,
			expectedClose: "",
			contactId: contactA,
			companyId: "",
			ownerId: "",
			lostReason: "",
		});
		// Not won yet
		expect(
			await status(
				projects.createProjectFromDeal(a.workspaceId, actorA(), d.id),
			),
		).toBe(409);
		await deals.moveDeal(a.workspaceId, actorA(), {
			id: d.id,
			stageId: found.stages[1].id,
			lostReason: "",
		});
		const results = await Promise.all([
			status(projects.createProjectFromDeal(a.workspaceId, actorA(), d.id)),
			status(projects.createProjectFromDeal(a.workspaceId, actorA(), d.id)),
		]);
		expect(results.sort()).toEqual([200, 409]);
		const [p] = await projects.relatedProjects(a.workspaceId, { dealId: d.id });
		expect([p.name, p.contactId, p.status]).toEqual([
			"Shop build",
			contactA,
			"planned",
		]);
		// Archive it, make a new one, then restoring the first is refused
		await projects.setProjectArchived(a.workspaceId, actorA(), p.id, true);
		await projects.createProjectFromDeal(a.workspaceId, actorA(), d.id);
		expect(
			await status(
				projects.setProjectArchived(a.workspaceId, actorA(), p.id, false),
			),
		).toBe(409);
		// On the deal's timeline too
		const timeline = await records.getTimeline(a.workspaceId, "deal", d.id);
		expect(timeline.events.map((e) => e.type)).toContain("project.created");
	});

	test("merging contacts moves their projects", async () => {
		const keep = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Keep"),
		);
		const dup = await contacts.createContact(
			a.workspaceId,
			actorA(),
			person("Dup"),
		);
		const { id } = await projects.createProject(
			a.workspaceId,
			actorA(),
			input({ contactId: dup.id }),
		);
		await contacts.mergeContacts(a.workspaceId, actorA(), {
			keepId: keep.id,
			duplicateId: dup.id,
			choices: {},
		});
		const { project: p } = await projects.getProjectDetail(a.workspaceId, id);
		expect(p.contactId).toBe(keep.id);
	});

	test("never reaches across workspaces", async () => {
		const { id } = await projects.createProject(
			a.workspaceId,
			actorA(),
			input({ name: "Private" }),
		);
		expect(await status(projects.getProjectDetail(b.workspaceId, id))).toBe(
			404,
		);
		expect(
			await status(
				projects.updateProject(b.workspaceId, actorB(), id, input()),
			),
		).toBe(404);
		expect(
			await status(
				projects.setProjectArchived(b.workspaceId, actorB(), id, true),
			),
		).toBe(404);
		// B can't link A's contact
		expect(
			await status(
				projects.createProject(
					b.workspaceId,
					actorB(),
					input({ contactId: contactA }),
				),
			),
		).toBe(400);
		const listB = await projects.listProjects(b.workspaceId, {
			page: 1,
			pageSize: 100,
			q: "Private",
			sort: "createdAt",
			dir: "desc",
			show: "active",
			filters: [],
		});
		expect(listB.total).toBe(0);
	});
});
