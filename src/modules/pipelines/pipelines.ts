import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "#/lib/authz";
import * as data from "./pipelines.server";
import {
	pipelineIdSchema,
	pipelineInputSchema,
	updatePipelineSchema,
} from "./schema";

// Server functions for pipelines and stages. Each checks the caller's role and
// validates its input, then calls the data layer with the workspace from the
// session (context.workspaceId), never from input.

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listPipelines = createServerFn({ method: "GET" })
	.middleware([requirePermission({ pipeline: ["read"] })])
	.validator(z.object({ includeArchived: z.boolean().default(false) }))
	.handler(({ data: { includeArchived }, context }) =>
		data.listPipelines(context.workspaceId, { includeArchived }),
	);

export const createPipeline = createServerFn({ method: "POST" })
	.middleware([requirePermission({ pipeline: ["create"] })])
	.validator(pipelineInputSchema)
	.handler(({ data: input, context }) =>
		data.createPipeline(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updatePipeline = createServerFn({ method: "POST" })
	.middleware([requirePermission({ pipeline: ["update"] })])
	.validator(updatePipelineSchema)
	.handler(({ data: input, context }) =>
		data.updatePipeline(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const archivePipeline = createServerFn({ method: "POST" })
	.middleware([requirePermission({ pipeline: ["delete"] })])
	.validator(pipelineIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setPipelineArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			true,
		),
	);

export const restorePipeline = createServerFn({ method: "POST" })
	.middleware([requirePermission({ pipeline: ["delete"] })])
	.validator(pipelineIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setPipelineArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			false,
		),
	);

export type Pipelines = Awaited<ReturnType<typeof listPipelines>>;
