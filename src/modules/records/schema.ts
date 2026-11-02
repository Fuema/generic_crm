import { z } from "zod";
import { m } from "#/paraglide/messages.js";

// Tags, notes and the timeline work on any record type listed here. Each maps to
// the permission resource checked for it (spec §7.4).
export const SUBJECT_TYPES = ["contact", "company"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const SUBJECT_RESOURCE: Record<SubjectType, "contact" | "company"> = {
	contact: "contact",
	company: "company",
};

export const TAG_COLORS = [
	"gray",
	"red",
	"orange",
	"amber",
	"green",
	"teal",
	"blue",
	"violet",
	"pink",
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const LIMITS = {
	tagsPerRecord: 20,
	tagsPerWorkspace: 500,
	noteLength: 10_000,
} as const;

const subject = {
	subjectType: z.enum(SUBJECT_TYPES),
	subjectId: z.uuid({ error: () => m.validation_invalid_id() }),
};

export const subjectSchema = z.object(subject);

export const tagNameSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_tag_name_required() })
	.max(40, { error: () => m.validation_text_max({ max: 40 }) });

export const addTagSchema = z.object({ ...subject, name: tagNameSchema });

export const removeTagSchema = z.object({
	...subject,
	tagId: z.uuid({ error: () => m.validation_invalid_id() }),
});

const noteBody = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_note_required() })
	.max(LIMITS.noteLength, {
		error: () => m.validation_text_max({ max: LIMITS.noteLength }),
	});

export const createNoteSchema = z.object({ ...subject, body: noteBody });

export const updateNoteSchema = z.object({
	id: z.uuid({ error: () => m.validation_invalid_id() }),
	body: noteBody,
	pinned: z.boolean(),
});

export const noteIdSchema = z.object({
	id: z.uuid({ error: () => m.validation_invalid_id() }),
});
