import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { fieldDefinition, fieldGroup, pipeline, savedView } from "#/db/schema";
import * as fields from "#/modules/fields/fields.server";
import {
	FIELD_TYPES,
	localized,
	OBJECT_KEYS,
	type ObjectKey,
} from "#/modules/fields/schema";
import { createPipeline } from "#/modules/pipelines/pipelines.server";
import { STAGE_TYPES, stagesProblem } from "#/modules/pipelines/schema";
import { viewConfigSchema } from "#/modules/views/schema";
import { createView } from "#/modules/views/views.server";
import generic from "../../../templates/generic.json";

// Server-only. Industry templates are data files in templates/ (spec §7.5):
// fields, groups, saved views and pipelines today; more as modules arrive.
// Applying adds only what's missing, so it is safe to run more than once, and
// never changes or removes anything the workspace already has.

const localizedSchema = z.object({ en: z.string(), es: z.string() });

const templateSchema = z.object({
	key: z.string(),
	version: z.number().int(),
	objects: z.partialRecord(
		z.enum(OBJECT_KEYS),
		z.object({
			groups: z.array(
				z.object({
					label: localizedSchema,
					fields: z.array(
						z.object({
							key: z.string().regex(/^[a-z][a-z0-9_]{0,35}$/),
							type: z.enum(FIELD_TYPES),
							label: localizedSchema,
							help: localizedSchema.optional(),
							options: z
								.array(z.object({ value: z.string(), label: localizedSchema }))
								.optional(),
						}),
					),
				}),
			),
		}),
	),
	views: z.array(
		z.object({
			objectKey: z.enum(OBJECT_KEYS),
			name: localizedSchema,
			config: viewConfigSchema,
		}),
	),
	pipelines: z
		.array(
			z.object({
				key: z.string().regex(/^[a-z][a-z0-9_]{0,35}$/),
				name: localizedSchema,
				stages: z
					.array(
						z.object({
							name: localizedSchema,
							probability: z.number().int().min(0).max(100),
							type: z.enum(STAGE_TYPES),
						}),
					)
					.refine((stages) => !stagesProblem(stages)),
			}),
		)
		.default([]),
});
export type Template = z.infer<typeof templateSchema>;

// Parsed when the server starts: a broken template file fails loudly
export const TEMPLATES = { generic: templateSchema.parse(generic) } as const;

async function existing(workspaceId: string, objectKey: ObjectKey) {
	const [fieldRows, groupRows, viewRows] = await Promise.all([
		db
			.select({ key: fieldDefinition.key })
			.from(fieldDefinition)
			.where(
				and(
					eq(fieldDefinition.workspaceId, workspaceId),
					eq(fieldDefinition.objectKey, objectKey),
				),
			),
		db
			.select({
				id: fieldGroup.id,
				label: fieldGroup.label,
				archivedAt: fieldGroup.archivedAt,
			})
			.from(fieldGroup)
			.where(
				and(
					eq(fieldGroup.workspaceId, workspaceId),
					eq(fieldGroup.objectKey, objectKey),
				),
			),
		db
			.select({ name: savedView.name })
			.from(savedView)
			.where(
				and(
					eq(savedView.workspaceId, workspaceId),
					eq(savedView.objectKey, objectKey),
					eq(savedView.shared, true),
				),
			),
	]);
	return {
		// Archived fields count too: their key stays taken
		fieldKeys: new Set(fieldRows.map((r) => r.key)),
		groups: groupRows.filter((g) => !g.archivedAt),
		viewNames: new Set(viewRows.map((r) => r.name.toLowerCase())),
	};
}

// Pipeline keys this workspace already has (archived ones too)
async function pipelineKeys(workspaceId: string) {
	const rows = await db
		.select({ key: pipeline.key })
		.from(pipeline)
		.where(eq(pipeline.workspaceId, workspaceId));
	return new Set(rows.map((r) => r.key));
}

// What applying the template would still add to this workspace
export async function templateStatus(
	workspaceId: string,
	template: Template = TEMPLATES.generic,
) {
	const keys = await pipelineKeys(workspaceId);
	const pipelinesMissing = template.pipelines.filter(
		(p) => !keys.has(p.key),
	).length;
	let fieldsMissing = 0;
	let viewsMissing = 0;
	for (const objectKey of OBJECT_KEYS) {
		const have = await existing(workspaceId, objectKey);
		for (const group of template.objects[objectKey]?.groups ?? []) {
			fieldsMissing += group.fields.filter(
				(f) => !have.fieldKeys.has(f.key),
			).length;
		}
		viewsMissing += template.views.filter(
			(v) =>
				v.objectKey === objectKey &&
				!have.viewNames.has(v.name.en.toLowerCase()) &&
				!have.viewNames.has(v.name.es.toLowerCase()),
		).length;
	}
	return { fieldsMissing, viewsMissing, pipelinesMissing };
}

// Adds the template's missing groups, fields, shared views and pipelines.
// Views are named in the language of the request and owned by the given member.
export async function applyTemplate(
	workspaceId: string,
	userId: string,
	template: Template = TEMPLATES.generic,
) {
	const actor = { type: "member" as const, id: userId };
	const added = { groups: 0, fields: 0, views: 0, pipelines: 0 };
	for (const objectKey of OBJECT_KEYS) {
		const have = await existing(workspaceId, objectKey);
		for (const group of template.objects[objectKey]?.groups ?? []) {
			const missing = group.fields.filter((f) => !have.fieldKeys.has(f.key));
			if (!missing.length) continue;
			let groupId = have.groups.find((g) => g.label.en === group.label.en)?.id;
			if (!groupId) {
				groupId = (
					await fields.createGroup(workspaceId, actor, {
						objectKey,
						label: group.label,
					})
				).id;
				added.groups += 1;
			}
			for (const f of missing) {
				// Applied twice at the same moment: the other run already added it
				const created = await fields
					.createField(
						workspaceId,
						actor,
						{
							objectKey,
							type: f.type,
							label: f.label,
							help: f.help ?? { en: "", es: "" },
							options: f.options ?? [],
							required: false,
							unique: false,
							groupId,
						},
						f.key,
					)
					.catch((error) => {
						if (error instanceof Response && error.status === 409) return null;
						throw error;
					});
				if (created) added.fields += 1;
			}
		}
		for (const view of template.views.filter(
			(v) => v.objectKey === objectKey,
		)) {
			if (
				have.viewNames.has(view.name.en.toLowerCase()) ||
				have.viewNames.has(view.name.es.toLowerCase())
			)
				continue;
			await createView(workspaceId, userId, {
				objectKey,
				name: localized(view.name),
				shared: true,
				config: view.config,
			});
			added.views += 1;
		}
	}
	const keys = await pipelineKeys(workspaceId);
	for (const p of template.pipelines.filter((p) => !keys.has(p.key))) {
		// Applied twice at the same moment: the other run already added it
		const created = await createPipeline(
			workspaceId,
			actor,
			{ name: p.name, stages: p.stages.map((s) => ({ ...s, id: "" })) },
			p.key,
		).catch(async (error) => {
			// Only "it already exists" is fine (another run added it); other
			// refusals, such as the pipeline limit, are reported
			if (
				error instanceof Response &&
				error.status === 409 &&
				(await pipelineKeys(workspaceId)).has(p.key)
			)
				return null;
			throw error;
		});
		if (created) added.pipelines += 1;
	}
	return added;
}

// For workspace creation: the workspace must be usable even if the template
// can't be applied, so a failure is logged instead of breaking sign-up
export async function applyTemplateToNewWorkspace(
	workspaceId: string,
	userId: string,
) {
	try {
		await applyTemplate(workspaceId, userId);
	} catch (error) {
		// A fixed message: database errors can include the query and its values
		console.error(
			`Couldn't apply the workspace template (workspace ${workspaceId})`,
			error instanceof Response ? error.status : "",
		);
	}
}
