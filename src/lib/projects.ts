import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { project } from "#/db/schema";
import { requirePermission } from "#/lib/authz";
import { projectInputSchema } from "#/lib/schema";

// Every query filters by context.organizationId (the caller's active workspace),
// so a project ID from another workspace can never be read or changed.

const projectIdSchema = z.object({ id: z.uuid("Invalid project id") });

export const listProjects = createServerFn({ method: "GET" })
	.middleware([requirePermission({ project: ["read"] })])
	.handler(async ({ context }) => {
		return db
			.select()
			.from(project)
			.where(eq(project.organizationId, context.organizationId))
			.orderBy(desc(project.createdAt));
	});

export const createProject = createServerFn({ method: "POST" })
	.middleware([requirePermission({ project: ["create"] })])
	.validator(projectInputSchema)
	.handler(async ({ data, context }) => {
		const [created] = await db
			.insert(project)
			.values({
				id: crypto.randomUUID(),
				organizationId: context.organizationId,
				name: data.name,
				description: data.description || null,
				createdById: context.session.user.id,
			})
			.returning();
		return created;
	});

export const updateProject = createServerFn({ method: "POST" })
	.middleware([requirePermission({ project: ["update"] })])
	.validator(projectIdSchema.extend(projectInputSchema.shape))
	.handler(async ({ data, context }) => {
		const [updated] = await db
			.update(project)
			.set({
				name: data.name,
				description: data.description || null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(project.id, data.id),
					eq(project.organizationId, context.organizationId),
				),
			)
			.returning();
		if (!updated) throw new Response("Project not found", { status: 404 });
		return updated;
	});

export const deleteProject = createServerFn({ method: "POST" })
	.middleware([requirePermission({ project: ["delete"] })])
	.validator(projectIdSchema)
	.handler(async ({ data, context }) => {
		const [deleted] = await db
			.delete(project)
			.where(
				and(
					eq(project.id, data.id),
					eq(project.organizationId, context.organizationId),
				),
			)
			.returning({ id: project.id });
		if (!deleted) throw new Response("Project not found", { status: 404 });
		return deleted;
	});
