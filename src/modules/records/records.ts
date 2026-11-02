import { createServerFn } from "@tanstack/react-start";
import { requireWorkspace } from "#/lib/authz";
import { assertPermission, hasPermission } from "#/platform/permissions.server";
import * as data from "./records.server";
import {
	addTagSchema,
	createNoteSchema,
	noteIdSchema,
	removeTagSchema,
	SUBJECT_RESOURCE,
	type SubjectType,
	subjectSchema,
	updateNoteSchema,
} from "./schema";

// Server functions for tags, notes and the timeline of any record. The permission
// depends on the record type in the input, so each handler checks it with
// assertPermission (which also confirms the caller is still a member) before
// calling the data layer with the workspace from the session.

const member = (userId: string) => ({ type: "member" as const, id: userId });

function can(
	workspaceId: string,
	subjectType: SubjectType,
	action: "read" | "update" | "delete",
) {
	return assertPermission(workspaceId, {
		[SUBJECT_RESOURCE[subjectType]]: [action],
	});
}

export const getTimeline = createServerFn({ method: "GET" })
	.middleware([requireWorkspace])
	.validator(subjectSchema)
	.handler(async ({ data: input, context }) => {
		await can(context.workspaceId, input.subjectType, "read");
		return data.getTimeline(
			context.workspaceId,
			input.subjectType,
			input.subjectId,
		);
	});

export const listWorkspaceTags = createServerFn({ method: "GET" })
	.middleware([requireWorkspace])
	.handler(async ({ context }) => {
		// Tag names are shared by every record type; reading contacts is enough
		await assertPermission(context.workspaceId, { contact: ["read"] });
		return data.listWorkspaceTags(context.workspaceId);
	});

export const addTag = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(addTagSchema)
	.handler(async ({ data: input, context }) => {
		await can(context.workspaceId, input.subjectType, "update");
		return data.addTag(
			context.workspaceId,
			member(context.session.user.id),
			input,
		);
	});

export const removeTag = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(removeTagSchema)
	.handler(async ({ data: input, context }) => {
		await can(context.workspaceId, input.subjectType, "update");
		return data.removeTag(
			context.workspaceId,
			member(context.session.user.id),
			input,
		);
	});

export const createNote = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(createNoteSchema)
	.handler(async ({ data: input, context }) => {
		await can(context.workspaceId, input.subjectType, "update");
		return data.createNote(
			context.workspaceId,
			member(context.session.user.id),
			input,
		);
	});

export const updateNote = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(updateNoteSchema)
	.handler(async ({ data: input, context }) => {
		// Confirm membership before revealing whether the note exists
		await assertPermission(context.workspaceId, { contact: ["read"] });
		const subject = await data.getNoteSubject(context.workspaceId, input.id);
		await can(context.workspaceId, subject.subjectType, "update");
		return data.updateNote(
			context.workspaceId,
			member(context.session.user.id),
			input,
		);
	});

export const deleteNote = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(noteIdSchema)
	.handler(async ({ data: { id }, context }) => {
		// Confirm membership before revealing whether the note exists
		await assertPermission(context.workspaceId, { contact: ["read"] });
		const subject = await data.getNoteSubject(context.workspaceId, id);
		await can(context.workspaceId, subject.subjectType, "update");
		// Authors delete their own notes; owners and admins delete any
		const canDeleteAny = await hasPermission(context.workspaceId, {
			[SUBJECT_RESOURCE[subject.subjectType]]: ["delete"],
		});
		return data.deleteNote(
			context.workspaceId,
			member(context.session.user.id),
			id,
			canDeleteAny,
		);
	});

export type Timeline = Awaited<ReturnType<typeof getTimeline>>;
export type TimelineNote = Timeline["notes"][number];
export type TimelineEvent = Timeline["events"][number];
export type TagChip = Timeline["tags"][number];
