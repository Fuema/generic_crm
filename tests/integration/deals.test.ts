import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { deal, event } from "#/db/schema";
import * as contacts from "#/modules/contacts/contacts.server";
import type { ContactInput } from "#/modules/contacts/schema";
import * as deals from "#/modules/deals/deals.server";
import type { DealInput } from "#/modules/deals/schema";
import * as pipelines from "#/modules/pipelines/pipelines.server";
import type { StageInput } from "#/modules/pipelines/schema";
import * as records from "#/modules/records/records.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Deals: stages and status, events, references, the rules pipelines enforce
// for their deals, merging contacts, and workspace isolation.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });

const contactInput = (firstName: string): ContactInput => ({
	firstName,
	lastName: "",
	email: "",
	phone: "",
	jobTitle: "",
	companyId: "",
	ownerId: "",
	lifecycleStage: "lead",
	locale: "",
	emailConsent: "unknown",
});

const stage = (
	en: string,
	type: StageInput["type"] = "open",
	id = "",
): StageInput => ({ id, name: { en, es: "" }, probability: 50, type });

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

type Setup = Awaited<ReturnType<typeof setup>>;
async function setup(w: Workspace, label: string) {
	const actor = { type: "member" as const, id: w.userId };
	const p = await pipelines.createPipeline(w.workspaceId, actor, {
		name: { en: `Sales ${label}`, es: "" },
		stages: [
			stage("New"),
			stage("Proposal"),
			stage("Won", "won"),
			stage("Lost", "lost"),
		],
	});
	const [found] = (
		await pipelines.listPipelines(w.workspaceId, { includeArchived: false })
	).filter((x) => x.id === p.id);
	const [open, proposal, won, lost] = found.stages;
	const person = await contacts.createContact(
		w.workspaceId,
		actor,
		contactInput(`Ana ${label}`),
	);
	return { pipelineId: p.id, open, proposal, won, lost, contactId: person.id };
}

const dealInput = (s: Setup, patch: Partial<DealInput> = {}): DealInput => ({
	name: "Website",
	pipelineId: s.pipelineId,
	stageId: s.open.id,
	valueCents: 120_000,
	expectedClose: "2026-12-15",
	contactId: s.contactId,
	companyId: "",
	ownerId: "",
	lostReason: "",
	...patch,
});

async function eventTypes(dealId: string) {
	const rows = await db
		.select({ type: event.type, payload: event.payload })
		.from(event)
		.where(and(eq(event.subjectType, "deal"), eq(event.subjectId, dealId)))
		.orderBy(event.createdAt, event.id);
	return rows;
}

let sa: Setup;
let sb: Setup;
beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("da"), createWorkspace("db")]);
	[sa, sb] = await Promise.all([setup(a, "A"), setup(b, "B")]);
});
afterAll(cleanup);

describe("deals", () => {
	test("create, move through stages, win, reopen and lose with a reason", async () => {
		const { id } = await deals.createDeal(
			a.workspaceId,
			actorA(),
			dealInput(sa),
		);
		let [row] = await db.select().from(deal).where(eq(deal.id, id));
		expect(row.status).toBe("open");
		expect(row.expectedCloseAt?.toISOString()).toBe("2026-12-15T12:00:00.000Z");

		await deals.moveDeal(a.workspaceId, actorA(), {
			id,
			stageId: sa.won.id,
			lostReason: "",
		});
		[row] = await db.select().from(deal).where(eq(deal.id, id));
		expect(row.status).toBe("won");
		expect(row.closedAt).not.toBeNull();

		await deals.moveDeal(a.workspaceId, actorA(), {
			id,
			stageId: sa.proposal.id,
			lostReason: "",
		});
		[row] = await db.select().from(deal).where(eq(deal.id, id));
		expect([row.status, row.closedAt]).toEqual(["open", null]);

		// Lost needs a reason
		expect(
			await status(
				deals.moveDeal(a.workspaceId, actorA(), {
					id,
					stageId: sa.lost.id,
					lostReason: " ",
				}),
			),
		).toBe(400);
		await deals.moveDeal(a.workspaceId, actorA(), {
			id,
			stageId: sa.lost.id,
			lostReason: "Went with a competitor",
		});
		[row] = await db.select().from(deal).where(eq(deal.id, id));
		expect([row.status, row.lostReason]).toEqual([
			"lost",
			"Went with a competitor",
		]);

		// Events of one batch share a timestamp, so compare them as a set
		const types = (await eventTypes(id)).map((e) => e.type);
		expect(types.sort()).toEqual(
			[
				"deal.created",
				"deal.stage_changed",
				"deal.won",
				"deal.stage_changed",
				"deal.reopened",
				"deal.stage_changed",
				"deal.lost",
			].sort(),
		);
	});

	test("updates record field changes; tags and notes work on deals", async () => {
		const { id } = await deals.createDeal(
			a.workspaceId,
			actorA(),
			dealInput(sa, { name: "Logo" }),
		);
		await deals.updateDeal(
			a.workspaceId,
			actorA(),
			id,
			dealInput(sa, { name: "Logo v2", valueCents: 5_000 }),
		);
		const updated = (await eventTypes(id)).find(
			(e) => e.type === "deal.updated",
		);
		expect(
			Object.keys((updated?.payload as { changes: object }).changes).sort(),
		).toEqual(["name", "valueCents"]);
		await records.addTag(a.workspaceId, actorA(), {
			subjectType: "deal",
			subjectId: id,
			name: "hot",
		});
		await records.createNote(a.workspaceId, actorA(), {
			subjectType: "deal",
			subjectId: id,
			body: "Call Friday",
		});
		const timeline = await records.getTimeline(a.workspaceId, "deal", id);
		expect(timeline.tags.map((t) => t.name)).toEqual(["hot"]);
		expect(timeline.notes).toHaveLength(1);
	});

	test("refuses bad references: stage of another pipeline, archived contact, lost without reason", async () => {
		const other = await pipelines.createPipeline(a.workspaceId, actorA(), {
			name: { en: "Other", es: "" },
			stages: [stage("X"), stage("Won", "won"), stage("Lost", "lost")],
		});
		const [otherPipeline] = (
			await pipelines.listPipelines(a.workspaceId, { includeArchived: false })
		).filter((p) => p.id === other.id);
		expect(
			await status(
				deals.createDeal(
					a.workspaceId,
					actorA(),
					dealInput(sa, { stageId: otherPipeline.stages[0].id }),
				),
			),
		).toBe(400);
		expect(
			await status(
				deals.createDeal(
					a.workspaceId,
					actorA(),
					dealInput(sa, { stageId: sa.lost.id }),
				),
			),
		).toBe(400);
		const gone = await contacts.createContact(
			a.workspaceId,
			actorA(),
			contactInput("Gone"),
		);
		await contacts.setContactArchived(a.workspaceId, actorA(), gone.id, true);
		expect(
			await status(
				deals.createDeal(
					a.workspaceId,
					actorA(),
					dealInput(sa, { contactId: gone.id }),
				),
			),
		).toBe(400);
	});

	test("a stage with deals can't be removed; a pipeline with open deals can't be archived", async () => {
		const c = await createWorkspace("dc");
		const actor = { type: "member" as const, id: c.userId };
		const sc = await setup(c, "C");
		await pipelines.createPipeline(c.workspaceId, actor, {
			name: { en: "Spare", es: "" },
			stages: [stage("New"), stage("Won", "won"), stage("Lost", "lost")],
		});
		await deals.createDeal(
			c.workspaceId,
			actor,
			dealInput(sc, { stageId: sc.proposal.id }),
		);
		// Drop "Proposal", which holds the deal
		expect(
			await status(
				pipelines.updatePipeline(c.workspaceId, actor, {
					id: sc.pipelineId,
					name: { en: "Sales C", es: "" },
					stages: [
						stage("New", "open", sc.open.id),
						stage("Won", "won", sc.won.id),
						stage("Lost", "lost", sc.lost.id),
					],
				}),
			),
		).toBe(409);
		expect(
			await status(
				pipelines.setPipelineArchived(
					c.workspaceId,
					actor,
					sc.pipelineId,
					true,
				),
			),
		).toBe(409);
		// Dropping the empty "New" stage is fine
		await pipelines.updatePipeline(c.workspaceId, actor, {
			id: sc.pipelineId,
			name: { en: "Sales C", es: "" },
			stages: [
				stage("Proposal", "open", sc.proposal.id),
				stage("Won", "won", sc.won.id),
				stage("Lost", "lost", sc.lost.id),
			],
		});
	});

	test("a stage with deals keeps its type; a deal returns only to a stage that exists", async () => {
		const e = await createWorkspace("de");
		const actor = { type: "member" as const, id: e.userId };
		const se = await setup(e, "E");
		await deals.createDeal(
			e.workspaceId,
			actor,
			dealInput(se, { stageId: se.won.id }),
		);
		// Turning "Won" (with a won deal) into an open stage is refused
		expect(
			await status(
				pipelines.updatePipeline(e.workspaceId, actor, {
					id: se.pipelineId,
					name: { en: "Sales E", es: "" },
					stages: [
						stage("New", "open", se.open.id),
						stage("Proposal", "open", se.proposal.id),
						stage("Was won", "open", se.won.id),
						stage("Won", "won"),
						stage("Lost", "lost", se.lost.id),
					],
				}),
			),
		).toBe(409);

		// Archive a deal, remove its stage, then try to restore it
		const { id } = await deals.createDeal(
			e.workspaceId,
			actor,
			dealInput(se, { stageId: se.proposal.id }),
		);
		await deals.setDealArchived(e.workspaceId, actor, id, true);
		await pipelines.updatePipeline(e.workspaceId, actor, {
			id: se.pipelineId,
			name: { en: "Sales E", es: "" },
			stages: [
				stage("New", "open", se.open.id),
				stage("Won", "won", se.won.id),
				stage("Lost", "lost", se.lost.id),
			],
		});
		expect(
			await status(deals.setDealArchived(e.workspaceId, actor, id, false)),
		).toBe(409);
		// The pipeline can still be saved afterwards
		await pipelines.updatePipeline(e.workspaceId, actor, {
			id: se.pipelineId,
			name: { en: "Sales E", es: "Ventas E" },
			stages: [
				stage("New", "open", se.open.id),
				stage("Won", "won", se.won.id),
				stage("Lost", "lost", se.lost.id),
			],
		});
	});

	test("two moves of the same deal at once: one wins, events stay consistent", async () => {
		const { id } = await deals.createDeal(
			a.workspaceId,
			actorA(),
			dealInput(sa, { name: "Race" }),
		);
		const results = await Promise.all([
			status(
				deals.moveDeal(a.workspaceId, actorA(), {
					id,
					stageId: sa.won.id,
					lostReason: "",
				}),
			),
			status(
				deals.moveDeal(a.workspaceId, actorA(), {
					id,
					stageId: sa.lost.id,
					lostReason: "Budget",
				}),
			),
		]);
		expect(results.sort()).toEqual([200, 409]);
		const types = (await eventTypes(id)).map((e) => e.type);
		expect(types.filter((t) => t === "deal.stage_changed")).toHaveLength(1);
		expect(
			types.filter((t) => t === "deal.won" || t === "deal.lost"),
		).toHaveLength(1);
	});

	test("merging contacts moves their deals", async () => {
		const keep = await contacts.createContact(
			a.workspaceId,
			actorA(),
			contactInput("Keep"),
		);
		const dup = await contacts.createContact(
			a.workspaceId,
			actorA(),
			contactInput("Dup"),
		);
		const { id } = await deals.createDeal(
			a.workspaceId,
			actorA(),
			dealInput(sa, { contactId: dup.id }),
		);
		const result = await contacts.mergeContacts(a.workspaceId, actorA(), {
			keepId: keep.id,
			duplicateId: dup.id,
			choices: {},
		});
		expect(result.dealsMoved).toBe(1);
		const [row] = await db
			.select({ contactId: deal.contactId })
			.from(deal)
			.where(eq(deal.id, id));
		expect(row.contactId).toBe(keep.id);
		const related = await deals.relatedDeals(a.workspaceId, {
			contactId: keep.id,
		});
		expect(related.map((d) => d.id)).toContain(id);
	});

	test("lists, filters and the board", async () => {
		const search = {
			page: 1,
			pageSize: 100,
			q: "",
			sort: "createdAt",
			dir: "desc" as const,
			show: "active" as const,
			layout: "list" as const,
			filters: [],
		};
		const { id } = await deals.createDeal(
			a.workspaceId,
			actorA(),
			dealInput(sa, { name: "Filterable" }),
		);
		const found = await deals.listDeals(a.workspaceId, {
			...search,
			q: "Filterable",
		});
		expect(found.rows.map((r) => r.id)).toEqual([id]);
		expect(found.totalValueCents).toBe(120_000);
		const byStage = await deals.listDeals(a.workspaceId, {
			...search,
			filters: [{ field: "stageId", op: "any_of", value: [sa.open.id] }],
		});
		expect(byStage.rows.every((r) => r.stageId === sa.open.id)).toBe(true);
		const board = await deals.listBoard(a.workspaceId, sa.pipelineId, search);
		expect(board.rows.some((r) => r.id === id)).toBe(true);
	});

	test("never reaches across workspaces", async () => {
		const { id } = await deals.createDeal(
			a.workspaceId,
			actorA(),
			dealInput(sa, { name: "Private" }),
		);
		expect(await status(deals.getDealDetail(b.workspaceId, id))).toBe(404);
		expect(
			await status(
				deals.updateDeal(b.workspaceId, actorB(), id, dealInput(sb)),
			),
		).toBe(404);
		expect(
			await status(
				deals.moveDeal(b.workspaceId, actorB(), {
					id,
					stageId: sb.won.id,
					lostReason: "",
				}),
			),
		).toBe(404);
		expect(
			await status(deals.setDealArchived(b.workspaceId, actorB(), id, true)),
		).toBe(404);
		// B can't use A's contact, pipeline or stage
		expect(
			await status(
				deals.createDeal(
					b.workspaceId,
					actorB(),
					dealInput(sb, { contactId: sa.contactId }),
				),
			),
		).toBe(400);
		expect(
			await status(
				deals.createDeal(
					b.workspaceId,
					actorB(),
					dealInput(sb, { pipelineId: sa.pipelineId, stageId: sa.open.id }),
				),
			),
		).toBe(400);
		const listB = await deals.listDeals(b.workspaceId, {
			page: 1,
			pageSize: 100,
			q: "Private",
			sort: "createdAt",
			dir: "desc",
			show: "active",
			layout: "list",
			filters: [],
		});
		expect(listB.total).toBe(0);
		expect(
			await deals.relatedDeals(b.workspaceId, { contactId: sa.contactId }),
		).toEqual([]);
		// Tags and notes on A's deal from B are refused
		expect(
			await status(
				records.addTag(b.workspaceId, actorB(), {
					subjectType: "deal",
					subjectId: id,
					name: "x",
				}),
			),
		).toBe(404);
	});
});
