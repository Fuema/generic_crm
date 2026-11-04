import { createServerFn } from "@tanstack/react-start";
import { requireWorkspace } from "#/lib/authz";
import { SUBJECT_RESOURCE } from "#/modules/records/schema";
import { m } from "#/paraglide/messages.js";
import { assertPermission, hasPermission } from "#/platform/permissions.server";
import * as data from "./files.server";
import {
	createFolderSchema,
	fileIdSchema,
	fileRights,
	folderIdSchema,
	folderListSchema,
	moveFolderSchema,
	recordFilesSchema,
	renameFolderSchema,
	shareFileSchema,
} from "./schema";

// Server functions for files and folders (spec §9). Rights follow the record:
// a record's files need read on it to see, update to upload or share, and
// delete on it (or being the uploader who can still edit it) to delete.
// Workspace folders use the `file` resource: editors upload and organize,
// owners and admins delete. Each handler checks the right with
// assertPermission (which also confirms the membership), then calls the data
// layer with the workspace from the session (context.workspaceId).

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listRecordFiles = createServerFn({ method: "GET" })
	.middleware([requireWorkspace])
	.validator(recordFilesSchema)
	.handler(async ({ data: input, context }) => {
		await assertPermission(context.workspaceId, {
			[SUBJECT_RESOURCE[input.subjectType]]: ["read"],
		});
		return data.recordFiles(
			context.workspaceId,
			input.subjectType,
			input.subjectId,
		);
	});

export const deleteFile = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(fileIdSchema)
	.handler(async ({ data: { id }, context }) => {
		const row = await data.findFile(context.workspaceId, id);
		const own = row.uploadedById === context.session.user.id;
		const allowed =
			(await hasPermission(context.workspaceId, fileRights(row, "delete"))) ||
			// Record files: the uploader too, while they can still edit the record
			(own &&
				row.subjectType !== null &&
				(await hasPermission(context.workspaceId, fileRights(row, "update"))));
		if (!allowed) throw new Response(m.error_not_allowed(), { status: 403 });
		// The full right deletes at any time; the uploader only while the
		// record can still change
		if (!(await hasPermission(context.workspaceId, fileRights(row, "delete"))))
			await data.assertRecordWritable(context.workspaceId, row);
		return data.deleteFile(
			context.workspaceId,
			member(context.session.user.id),
			row,
		);
	});

// "Shared with customer" (shown in the portal, phase 4)
export const setFileShared = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(shareFileSchema)
	.handler(async ({ data: { id, shared }, context }) => {
		const row = await data.findFile(context.workspaceId, id);
		await assertPermission(context.workspaceId, fileRights(row, "update"));
		return data.setFileShared(
			context.workspaceId,
			member(context.session.user.id),
			row,
			shared,
		);
	});

export const listFolder = createServerFn({ method: "GET" })
	.middleware([requireWorkspace])
	.validator(folderListSchema)
	.handler(async ({ data: { folderId }, context }) => {
		await assertPermission(context.workspaceId, { file: ["read"] });
		return data.listFolder(context.workspaceId, folderId || null);
	});

export const listAllFolders = createServerFn({ method: "GET" })
	.middleware([requireWorkspace])
	.handler(async ({ context }) => {
		await assertPermission(context.workspaceId, { file: ["read"] });
		return data.allFolders(context.workspaceId);
	});

export const createFolder = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(createFolderSchema)
	.handler(async ({ data: input, context }) => {
		await assertPermission(context.workspaceId, { file: ["create"] });
		return data.createFolder(
			context.workspaceId,
			member(context.session.user.id),
			input,
		);
	});

export const renameFolder = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(renameFolderSchema)
	.handler(async ({ data: input, context }) => {
		await assertPermission(context.workspaceId, { file: ["update"] });
		return data.renameFolder(
			context.workspaceId,
			member(context.session.user.id),
			input,
		);
	});

export const moveFolder = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(moveFolderSchema)
	.handler(async ({ data: input, context }) => {
		await assertPermission(context.workspaceId, { file: ["update"] });
		return data.moveFolder(
			context.workspaceId,
			member(context.session.user.id),
			input,
		);
	});

export const deleteFolder = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(folderIdSchema)
	.handler(async ({ data: { id }, context }) => {
		await assertPermission(context.workspaceId, { file: ["delete"] });
		return data.deleteFolder(
			context.workspaceId,
			member(context.session.user.id),
			id,
		);
	});

export type FileItem = Awaited<ReturnType<typeof listRecordFiles>>[number];
export type FolderListing = Awaited<ReturnType<typeof listFolder>>;
export type FolderOption = Awaited<ReturnType<typeof listAllFolders>>[number];
