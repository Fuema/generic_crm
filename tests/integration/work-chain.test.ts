import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { roleCan } from "#/lib/permissions";
import * as contacts from "#/modules/contacts/contacts.server";
import * as deals from "#/modules/deals/deals.server";
import * as files from "#/modules/files/files.server";
import * as pipelines from "#/modules/pipelines/pipelines.server";
import * as projects from "#/modules/projects/projects.server";
import * as records from "#/modules/records/records.server";
import type { TaskInput } from "#/modules/tasks/schema";
import * as work from "#/modules/tasks/tasks.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Phase 3 acceptance (spec §16): "A won deal becomes a project with tasks and
// files; downloads are permission-checked". The same data layer the pages
// use: a deal is won, "Create project" makes the project, tasks (one a
// milestone) and an activity go on it, files go on the project and the deal,
// and every step shows on the timelines and cards. Downloads go through
// authorizeDownload, the check the download route runs, with each role.
let a: Workspace;
let b: Workspace;
const actor = () => ({ type: "member" as const, id: a.userId });

const content = (text: string) => {
	const encoded = new TextEncoder().encode(text);
	return { size: encoded.byteLength, body: new Blob([encoded]).stream() };
};

const taskInput = (patch: Partial<TaskInput>): TaskInput => ({
	title: "Task",
	description: "",
	status: "todo",
	priority: "medium",
	assigneeId: "",
	dueAt: null,
	allDay: true,
	isMilestone: false,
	subjectType: "",
	subjectId: "",
	projectId: "",
	...patch,
});

// The role check the route gets from Better Auth, from the same role table
const as = (role: string, workspaceId: string) => ({
	workspaceId,
	can: async (permissions: Parameters<typeof roleCan>[1]) =>
		roleCan(role, permissions),
});

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("wca"), createWorkspace("wcb")]);
});
afterAll(cleanup);

describe("phase 3 acceptance", () => {
	test("a won deal becomes a project with tasks and files, all on the timelines", async () => {
		const ana = await contacts.createContact(a.workspaceId, actor(), {
			firstName: "Ana",
			lastName: "Ruiz",
			email: "",
			phone: "",
			jobTitle: "",
			companyId: "",
			ownerId: "",
			lifecycleStage: "lead",
			locale: "en",
			emailConsent: "unknown",
		});
		const pl = await pipelines.createPipeline(a.workspaceId, actor(), {
			name: { en: "Sales", es: "" },
			stages: [
				{ id: "", name: { en: "New", es: "" }, probability: 10, type: "open" },
				{ id: "", name: { en: "Won", es: "" }, probability: 100, type: "won" },
				{ id: "", name: { en: "Lost", es: "" }, probability: 0, type: "lost" },
			],
		});
		const [sales] = (
			await pipelines.listPipelines(a.workspaceId, { includeArchived: false })
		).filter((p) => p.id === pl.id);
		const d = await deals.createDeal(a.workspaceId, actor(), {
			name: "Website rebuild",
			pipelineId: pl.id,
			stageId: sales.stages[0].id,
			valueCents: 500_000,
			expectedClose: "",
			contactId: ana.id,
			companyId: "",
			ownerId: "",
			lostReason: "",
		});
		await deals.moveDeal(a.workspaceId, actor(), {
			id: d.id,
			stageId: sales.stages[1].id,
			lostReason: "",
		});

		// The deal becomes a project, with its name and contact
		const { id: projectId } = await projects.createProjectFromDeal(
			a.workspaceId,
			actor(),
			d.id,
		);
		const { project } = await projects.getProjectDetail(
			a.workspaceId,
			projectId,
		);
		expect([project.name, project.contactId, project.dealId]).toEqual([
			"Website rebuild",
			ana.id,
			d.id,
		]);

		// Tasks: a milestone, done; a task about the deal, on the project
		const launch = await work.createTask(
			a.workspaceId,
			actor(),
			taskInput({ title: "Launch", projectId, isMilestone: true }),
		);
		await work.updateTask(
			a.workspaceId,
			actor(),
			launch.id,
			taskInput({
				title: "Launch",
				projectId,
				isMilestone: true,
				status: "done",
			}),
		);
		await work.createTask(
			a.workspaceId,
			actor(),
			taskInput({
				title: "Send the handover",
				projectId,
				subjectType: "deal",
				subjectId: d.id,
			}),
		);
		await work.createActivity(a.workspaceId, actor(), {
			type: "meeting",
			subject: "Kickoff",
			notes: "",
			startsAt: new Date().toISOString(),
			endsAt: null,
			allDay: false,
			completed: false,
			ownerId: a.userId,
			subjectType: "",
			subjectId: "",
			projectId,
		});

		// Files on the project and on the deal
		const brief = await files.uploadFile(
			a.workspaceId,
			actor(),
			{
				kind: "record",
				subjectType: "project",
				subjectId: projectId,
				paymentId: "",
			},
			{ name: "brief.pdf", ...content("%PDF brief") },
		);
		await files.uploadFile(
			a.workspaceId,
			actor(),
			{ kind: "record", subjectType: "deal", subjectId: d.id, paymentId: "" },
			{ name: "signed offer.pdf", ...content("%PDF offer") },
		);

		// The project's card and files
		const card = await work.recordWork(a.workspaceId, {
			subjectType: "project",
			subjectId: projectId,
		});
		expect(card.tasks.map((t) => t.title).sort()).toEqual([
			"Launch",
			"Send the handover",
		]);
		expect(card.activities.map((x) => x.subject)).toEqual(["Kickoff"]);
		expect(
			(await files.recordFiles(a.workspaceId, "project", projectId)).map(
				(f) => f.id,
			),
		).toEqual([brief.id]);

		const types = async (
			subjectType: "contact" | "deal" | "project",
			subjectId: string,
		) =>
			(
				await records.getTimeline(a.workspaceId, subjectType, subjectId)
			).events.map((e) => e.type);

		// The project: created from the deal, its milestone and activity, its file
		const onProject = await types("project", projectId);
		expect(onProject).toEqual(
			expect.arrayContaining([
				"project.created",
				"task.created",
				"task.completed",
				"activity.created",
				"project.file_added",
			]),
		);
		// The deal: won, its project, the task about it, its own file
		const onDeal = await types("deal", d.id);
		expect(onDeal).toEqual(
			expect.arrayContaining([
				"deal.won",
				"project.created",
				"task.created",
				"deal.file_added",
			]),
		);
		// The contact: the deal and the project's milestones, not their files
		const onContact = await types("contact", ana.id);
		expect(onContact).toEqual(
			expect.arrayContaining(["deal.won", "project.created"]),
		);
		expect(onContact.some((t) => t.includes(".file_"))).toBe(false);
	});

	test("downloads are permission-checked", async () => {
		const p = await projects.createProject(a.workspaceId, actor(), {
			name: "Private project",
			description: "",
			status: "active",
			startDate: "",
			dueDate: "",
			ownerId: "",
			contactId: "",
			companyId: "",
		});
		const onProject = await files.uploadFile(
			a.workspaceId,
			actor(),
			{
				kind: "record",
				subjectType: "project",
				subjectId: p.id,
				paymentId: "",
			},
			{ name: "plan.txt", ...content("the plan") },
		);
		const shelf = await files.uploadFile(
			a.workspaceId,
			actor(),
			{ kind: "folder", folderId: "" },
			{ name: "handbook.txt", ...content("handbook") },
		);

		// Every role of the workspace can read; the bytes are the upload's
		for (const role of ["owner", "admin", "editor", "viewer"]) {
			for (const id of [onProject.id, shelf.id]) {
				const result = await files.authorizeDownload(
					as(role, a.workspaceId),
					id,
				);
				expect(result.ok).toBe(true);
			}
		}
		const granted = await files.authorizeDownload(
			as("viewer", a.workspaceId),
			onProject.id,
		);
		if (!granted.ok) throw new Error("expected access");
		const object = await files.openFile(granted.row);
		expect(object && (await new Response(object.body).text())).toBe("the plan");

		const denied = async (
			access: Parameters<typeof files.authorizeDownload>[0],
			id = onProject.id,
		) => {
			const result = await files.authorizeDownload(access, id);
			return result.ok ? 200 : result.status;
		};
		// No session, no active workspace
		expect(await denied(null)).toBe(401);
		expect(await denied({ workspaceId: null, can: async () => true })).toBe(
			403,
		);
		// Another workspace's owner, even with every right: not found
		expect(await denied(as("owner", b.workspaceId))).toBe(404);
		expect(await denied(as("owner", b.workspaceId), shelf.id)).toBe(404);
		// A role without read on the record, or no role: answered like a
		// missing file
		expect(
			await denied({
				workspaceId: a.workspaceId,
				can: async (perms) => !("project" in perms),
			}),
		).toBe(404);
		expect(await denied(as("stranger", a.workspaceId))).toBe(404);
		// Malformed and unknown ids
		expect(await denied(as("owner", a.workspaceId), "../etc/passwd")).toBe(404);
		expect(await denied(as("owner", a.workspaceId), crypto.randomUUID())).toBe(
			404,
		);
	});
});
