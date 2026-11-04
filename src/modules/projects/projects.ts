import { createServerFn } from "@tanstack/react-start";
import { requirePermission } from "#/lib/authz";
import * as data from "./projects.server";
import {
	projectFromDealSchema,
	projectIdSchema,
	projectInputSchema,
	projectSearchSchema,
	relatedProjectsSchema,
	updateProjectSchema,
} from "./schema";

// Server functions for projects. Each checks the caller's role and validates
// its input, then calls the data layer with the workspace from the session
// (context.workspaceId), never from input.

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listProjects = createServerFn({ method: "GET" })
	.middleware([requirePermission({ project: ["read"] })])
	.validator(projectSearchSchema)
	.handler(({ data: search, context }) =>
		data.listProjects(context.workspaceId, search),
	);

export const getProject = createServerFn({ method: "GET" })
	.middleware([requirePermission({ project: ["read"] })])
	.validator(projectIdSchema)
	.handler(({ data: { id }, context }) =>
		data.getProjectDetail(context.workspaceId, id),
	);

export const createProject = createServerFn({ method: "POST" })
	.middleware([requirePermission({ project: ["create"] })])
	.validator(projectInputSchema)
	.handler(({ data: input, context }) =>
		data.createProject(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const createProjectFromDeal = createServerFn({ method: "POST" })
	.middleware([requirePermission({ project: ["create"] })])
	.validator(projectFromDealSchema)
	.handler(({ data: { dealId }, context }) =>
		data.createProjectFromDeal(
			context.workspaceId,
			member(context.session.user.id),
			dealId,
		),
	);

export const updateProject = createServerFn({ method: "POST" })
	.middleware([requirePermission({ project: ["update"] })])
	.validator(updateProjectSchema)
	.handler(({ data: { id, ...input }, context }) =>
		data.updateProject(
			context.workspaceId,
			member(context.session.user.id),
			id,
			input,
		),
	);

export const archiveProject = createServerFn({ method: "POST" })
	.middleware([requirePermission({ project: ["delete"] })])
	.validator(projectIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setProjectArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			true,
		),
	);

export const restoreProject = createServerFn({ method: "POST" })
	.middleware([requirePermission({ project: ["delete"] })])
	.validator(projectIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setProjectArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			false,
		),
	);

export const listRelatedProjects = createServerFn({ method: "GET" })
	.middleware([requirePermission({ project: ["read"] })])
	.validator(relatedProjectsSchema)
	.handler(({ data: refs, context }) =>
		data.relatedProjects(context.workspaceId, refs),
	);

export type ProjectDetail = Awaited<ReturnType<typeof getProject>>;
export type ProjectRow = Awaited<
	ReturnType<typeof listProjects>
>["rows"][number];
