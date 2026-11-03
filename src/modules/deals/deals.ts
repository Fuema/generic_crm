import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "#/lib/authz";
import * as data from "./deals.server";
import {
	contactSearchSchema,
	dealIdSchema,
	dealInputSchema,
	dealSearchSchema,
	moveDealSchema,
	relatedDealsSchema,
	updateDealSchema,
} from "./schema";

// Server functions for deals. Each checks the caller's role and validates its
// input, then calls the data layer with the workspace from the session
// (context.workspaceId), never from input.

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listDeals = createServerFn({ method: "GET" })
	.middleware([requirePermission({ deal: ["read"] })])
	.validator(dealSearchSchema)
	.handler(({ data: search, context }) =>
		data.listDeals(context.workspaceId, search),
	);

export const listDealBoard = createServerFn({ method: "GET" })
	.middleware([requirePermission({ deal: ["read"] })])
	.validator(
		z.object({
			pipelineId: z.uuid(),
			search: dealSearchSchema,
		}),
	)
	.handler(({ data: input, context }) =>
		data.listBoard(context.workspaceId, input.pipelineId, input.search),
	);

export const getDeal = createServerFn({ method: "GET" })
	.middleware([requirePermission({ deal: ["read"] })])
	.validator(dealIdSchema)
	.handler(({ data: { id }, context }) =>
		data.getDealDetail(context.workspaceId, id),
	);

export const createDeal = createServerFn({ method: "POST" })
	.middleware([requirePermission({ deal: ["create"] })])
	.validator(dealInputSchema)
	.handler(({ data: input, context }) =>
		data.createDeal(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateDeal = createServerFn({ method: "POST" })
	.middleware([requirePermission({ deal: ["update"] })])
	.validator(updateDealSchema)
	.handler(({ data: { id, ...input }, context }) =>
		data.updateDeal(
			context.workspaceId,
			member(context.session.user.id),
			id,
			input,
		),
	);

export const moveDeal = createServerFn({ method: "POST" })
	.middleware([requirePermission({ deal: ["update"] })])
	.validator(moveDealSchema)
	.handler(({ data: input, context }) =>
		data.moveDeal(context.workspaceId, member(context.session.user.id), input),
	);

export const archiveDeal = createServerFn({ method: "POST" })
	.middleware([requirePermission({ deal: ["delete"] })])
	.validator(dealIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setDealArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			true,
		),
	);

export const restoreDeal = createServerFn({ method: "POST" })
	.middleware([requirePermission({ deal: ["delete"] })])
	.validator(dealIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setDealArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			false,
		),
	);

// Deals on a contact's or company's record page
export const listRelatedDeals = createServerFn({ method: "GET" })
	.middleware([requirePermission({ deal: ["read"] })])
	.validator(relatedDealsSchema)
	.handler(({ data: refs, context }) =>
		data.relatedDeals(context.workspaceId, refs),
	);

// The deal form's contact picker
export const searchDealContacts = createServerFn({ method: "GET" })
	.middleware([requirePermission({ contact: ["read"] })])
	.validator(contactSearchSchema)
	.handler(({ data: { q }, context }) =>
		data.searchContacts(context.workspaceId, q),
	);

export type DealDetail = Awaited<ReturnType<typeof getDeal>>;
export type DealRow = Awaited<ReturnType<typeof listDeals>>["rows"][number];
