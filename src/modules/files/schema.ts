import { z } from "zod";
import type { Permissions } from "#/lib/permissions";
import {
	SUBJECT_RESOURCE,
	SUBJECT_TYPES,
	type SubjectType,
} from "#/modules/records/schema";
import { m } from "#/paraglide/messages.js";

// Files and folders (spec §9), phase 3 step 4. Shared by the pages and the
// server; the server re-checks everything.

// Owner decisions 2026-11-04: 25 MB per file, 1 GB per workspace (the R2 free
// tier is 10 GB in all); folders nest up to 5 levels
export const FILE_LIMITS = {
	maxFileBytes: 25 * 1024 * 1024,
	workspaceQuotaBytes: 1024 * 1024 * 1024,
	folderDepth: 5,
	nameLength: 200,
	listed: 200,
} as const;

// Allowed types by extension; the server stores the type from this list, never
// the one the browser sent. No HTML or SVG (they could run scripts).
export const ALLOWED_TYPES: Record<string, string> = {
	pdf: "application/pdf",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	txt: "text/plain",
	csv: "text/csv",
	rtf: "application/rtf",
	doc: "application/msword",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	ppt: "application/vnd.ms-powerpoint",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	odt: "application/vnd.oasis.opendocument.text",
	ods: "application/vnd.oasis.opendocument.spreadsheet",
	odp: "application/vnd.oasis.opendocument.presentation",
	zip: "application/zip",
};

export const ACCEPT = Object.keys(ALLOWED_TYPES)
	.map((ext) => `.${ext}`)
	.join(",");

export function extensionOf(name: string) {
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function contentTypeFor(name: string) {
	return ALLOWED_TYPES[extensionOf(name)] ?? null;
}

export function formatBytes(bytes: number, locale?: string) {
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit ? 1 : 0 }).format(value)} ${units[unit]}`;
}

const id = z.uuid({ error: () => m.validation_invalid_id() });
const optionalId = z.union([z.literal(""), id]);

// Control characters, slashes and backslashes never belong in a name, nor
// invisible or direction marks that could disguise an extension
function unsafeChar(code: number) {
	return (
		code < 0x20 ||
		code === 0x7f ||
		code === 0x2f || // /
		code === 0x5c || // backslash
		(code >= 0x200b && code <= 0x200f) ||
		(code >= 0x202a && code <= 0x202e) ||
		(code >= 0x2066 && code <= 0x2069)
	);
}
const unsafeName = (v: string) =>
	[...v].some((ch) => unsafeChar(ch.codePointAt(0) ?? 0));

const safeName = (max: number) =>
	z
		.string()
		.trim()
		.min(1, { error: () => m.validation_file_name_required() })
		.max(max, { error: () => m.validation_text_max({ max }) })
		.refine((v) => !unsafeName(v), {
			error: () => m.validation_file_name_chars(),
		});

export const fileNameSchema = safeName(FILE_LIMITS.nameLength);
export const folderNameSchema = safeName(80);

export const recordFilesSchema = z.object({
	subjectType: z.enum(SUBJECT_TYPES),
	subjectId: id,
});

// Where an upload goes: a record (a receipt also names its payment, on an
// invoice), or the workspace tree ("" = top level)
export const uploadTargetSchema = z.union([
	z.object({
		kind: z.literal("record"),
		subjectType: z.enum(SUBJECT_TYPES),
		subjectId: id,
		paymentId: optionalId,
	}),
	z.object({ kind: z.literal("folder"), folderId: optionalId }),
]);
export type UploadTarget = z.infer<typeof uploadTargetSchema>;

export const fileIdSchema = z.object({ id });
export const shareFileSchema = z.object({ id, shared: z.boolean() });

export const folderListSchema = z.object({ folderId: optionalId });
export const createFolderSchema = z.object({
	name: folderNameSchema,
	parentId: optionalId,
});
export const renameFolderSchema = z.object({ id, name: folderNameSchema });
export const moveFolderSchema = z.object({ id, parentId: optionalId });
export const folderIdSchema = z.object({ id });

// The /files page's URL state
export const filesSearchSchema = z.object({
	folder: id.optional().catch(undefined),
});

// What a file's rights depend on: its record type, or the workspace tree
export function fileRights(
	row: { subjectType: string | null },
	action: "read" | "update" | "delete",
): Permissions {
	const resource = row.subjectType
		? SUBJECT_RESOURCE[row.subjectType as SubjectType]
		: undefined;
	if (row.subjectType && !resource) throw new Error("Unknown file record type");
	return resource ? { [resource]: [action] } : { file: [action] };
}
