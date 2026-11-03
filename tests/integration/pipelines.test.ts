import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event, pipelineStage } from "#/db/schema";
import * as pipelines from "#/modules/pipelines/pipelines.server";
import type { StageInput } from "#/modules/pipelines/schema";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Pipelines and stages: the stage rules, saving the whole list, archiving, and
// workspace isolation.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });

const stage = (
	en: string,
	type: StageInput["type"] = "open",
	probability = 50,
	id = "",
): StageInput => ({ id, name: { en, es: "" }, probability, type });
const basic = () => [
	stage("New", "open", 10),
	stage("Won", "won"),
	stage("Lost", "lost"),
];

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

async function find(workspaceId: string, id: string) {
	const list = await pipelines.listPipelines(workspaceId, {
		includeArchived: true,
	});
	const found = list.find((p) => p.id === id);
	if (!found) throw new Error("pipeline not listed");
	return found;
}

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("pa"), createWorkspace("pb")]);
});
afterAll(cleanup);

describe("pipelines", () => {
	test("create, then save the whole stage list: update, add, reorder, archive", async () => {
		const created = await pipelines.createPipeline(a.workspaceId, actorA(), {
			name: { en: "Rentals", es: "Alquileres" },
			stages: basic(),
		});
		expect(created.key).toBe("rentals");
		const again = await pipelines.createPipeline(a.workspaceId, actorA(), {
			name: { en: "Rentals", es: "" },
			stages: basic(),
		});
		expect(again.key).toBe("rentals_2");

		let p = await find(a.workspaceId, created.id);
		expect(p.stages.map((s) => [s.name.en, s.probability])).toEqual([
			["New", 10],
			["Won", 100], // normalized
			["Lost", 0],
		]);
		const [first, won, lost] = p.stages;

		await pipelines.updatePipeline(a.workspaceId, actorA(), {
			id: created.id,
			name: { en: "Rentals", es: "Alquileres" },
			stages: [
				stage("Visit", "open", 30),
				stage("Won", "won", 0, won.id),
				stage("Lost", "lost", 0, lost.id),
			],
		});
		p = await find(a.workspaceId, created.id);
		expect(p.stages.map((s) => s.name.en)).toEqual(["Visit", "Won", "Lost"]);
		// The dropped stage is archived, not deleted
		const [dropped] = await db
			.select({ archivedAt: pipelineStage.archivedAt })
			.from(pipelineStage)
			.where(eq(pipelineStage.id, first.id));
		expect(dropped.archivedAt).not.toBeNull();

		const events = await db
			.select({ type: event.type })
			.from(event)
			.where(
				and(eq(event.subjectType, "pipeline"), eq(event.subjectId, created.id)),
			);
		expect(events.map((e) => e.type).sort()).toEqual([
			"pipeline.created",
			"pipeline.updated",
		]);
	});

	test("refuses broken shapes and unknown or duplicated stage ids", async () => {
		expect(
			await status(
				pipelines.createPipeline(a.workspaceId, actorA(), {
					name: { en: "Bad", es: "" },
					stages: [stage("Won", "won"), stage("Lost", "lost")],
				}),
			),
		).toBe(400);
		const { id } = await pipelines.createPipeline(a.workspaceId, actorA(), {
			name: { en: "Ids", es: "" },
			stages: basic(),
		});
		const [open, won, lost] = (await find(a.workspaceId, id)).stages;
		expect(
			await status(
				pipelines.updatePipeline(a.workspaceId, actorA(), {
					id,
					name: { en: "Ids", es: "" },
					stages: [
						stage("A", "open", 1, open.id),
						stage("B", "open", 1, open.id),
						stage("Won", "won", 0, won.id),
						stage("Lost", "lost", 0, lost.id),
					],
				}),
			),
		).toBe(400);
		expect(
			await status(
				pipelines.updatePipeline(a.workspaceId, actorA(), {
					id,
					name: { en: "Ids", es: "" },
					stages: [
						stage("A", "open", 1, crypto.randomUUID()),
						stage("Won", "won", 0, won.id),
						stage("Lost", "lost", 0, lost.id),
					],
				}),
			),
		).toBe(400);
	});

	test("archive and restore; the last active pipeline stays", async () => {
		const c = await createWorkspace("pc");
		const actor = { type: "member" as const, id: c.userId };
		const one = await pipelines.createPipeline(c.workspaceId, actor, {
			name: { en: "One", es: "" },
			stages: basic(),
		});
		expect(
			await status(
				pipelines.setPipelineArchived(c.workspaceId, actor, one.id, true),
			),
		).toBe(409);
		const two = await pipelines.createPipeline(c.workspaceId, actor, {
			name: { en: "Two", es: "" },
			stages: basic(),
		});
		await pipelines.setPipelineArchived(c.workspaceId, actor, two.id, true);
		const active = await pipelines.listPipelines(c.workspaceId, {
			includeArchived: false,
		});
		expect(active.map((p) => p.id)).toEqual([one.id]);
		expect(
			await status(
				pipelines.updatePipeline(c.workspaceId, actor, {
					id: two.id,
					name: { en: "Two", es: "" },
					stages: basic(),
				}),
			),
		).toBe(409);
		await pipelines.setPipelineArchived(c.workspaceId, actor, two.id, false);
		const after = await pipelines.listPipelines(c.workspaceId, {
			includeArchived: false,
		});
		expect(after).toHaveLength(2);
	});

	test("a stage id from another pipeline of the same workspace is refused", async () => {
		const one = await pipelines.createPipeline(a.workspaceId, actorA(), {
			name: { en: "First", es: "" },
			stages: basic(),
		});
		const two = await pipelines.createPipeline(a.workspaceId, actorA(), {
			name: { en: "Second", es: "" },
			stages: basic(),
		});
		const [foreign] = (await find(a.workspaceId, one.id)).stages;
		const [, won, lost] = (await find(a.workspaceId, two.id)).stages;
		expect(
			await status(
				pipelines.updatePipeline(a.workspaceId, actorA(), {
					id: two.id,
					name: { en: "Second", es: "" },
					stages: [
						stage("Moved", "open", 10, foreign.id),
						stage("Won", "won", 0, won.id),
						stage("Lost", "lost", 0, lost.id),
					],
				}),
			),
		).toBe(400);
		expect((await find(a.workspaceId, one.id)).stages).toHaveLength(3);
	});

	test("two archives at once never leave a workspace without a pipeline", async () => {
		const d = await createWorkspace("pd");
		const actor = { type: "member" as const, id: d.userId };
		const x = await pipelines.createPipeline(d.workspaceId, actor, {
			name: { en: "X", es: "" },
			stages: basic(),
		});
		const y = await pipelines.createPipeline(d.workspaceId, actor, {
			name: { en: "Y", es: "" },
			stages: basic(),
		});
		const results = await Promise.all([
			status(pipelines.setPipelineArchived(d.workspaceId, actor, x.id, true)),
			status(pipelines.setPipelineArchived(d.workspaceId, actor, y.id, true)),
		]);
		expect(results.sort()).toEqual([200, 409]);
		const active = await pipelines.listPipelines(d.workspaceId, {
			includeArchived: false,
		});
		expect(active).toHaveLength(1);
		// Exactly one archive event: the refused one left no trace
		const events = await db
			.select({ type: event.type })
			.from(event)
			.where(
				and(
					eq(event.workspaceId, d.workspaceId),
					eq(event.type, "pipeline.archived"),
				),
			);
		expect(events).toHaveLength(1);
	});

	test("never reaches across workspaces", async () => {
		const mine = await pipelines.createPipeline(a.workspaceId, actorA(), {
			name: { en: "Mine", es: "" },
			stages: basic(),
		});
		const p = await find(a.workspaceId, mine.id);
		const listB = await pipelines.listPipelines(b.workspaceId, {
			includeArchived: true,
		});
		expect(listB.some((x) => x.id === mine.id)).toBe(false);
		expect(
			await status(
				pipelines.updatePipeline(b.workspaceId, actorB(), {
					id: mine.id,
					name: { en: "Taken", es: "" },
					stages: basic(),
				}),
			),
		).toBe(404);
		expect(
			await status(
				pipelines.setPipelineArchived(b.workspaceId, actorB(), mine.id, true),
			),
		).toBe(404);

		// B can't adopt A's stages into its own pipeline
		const theirs = await pipelines.createPipeline(b.workspaceId, actorB(), {
			name: { en: "Theirs", es: "" },
			stages: basic(),
		});
		const [, won, lost] = p.stages;
		expect(
			await status(
				pipelines.updatePipeline(b.workspaceId, actorB(), {
					id: theirs.id,
					name: { en: "Theirs", es: "" },
					stages: [
						stage("New"),
						stage("Won", "won", 0, won.id),
						stage("Lost", "lost", 0, lost.id),
					],
				}),
			),
		).toBe(400);
	});
});
