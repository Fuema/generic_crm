import { z } from "zod";
import { type Localized, labelSchema } from "#/modules/fields/schema";
import { m } from "#/paraglide/messages.js";

// Pipelines and stages (spec §6.2, §10 Deals). Shared by the settings page and
// the server; the server re-checks everything.

export const STAGE_TYPES = ["open", "won", "lost"] as const;
export type StageType = (typeof STAGE_TYPES)[number];

export const STAGE_TYPE_LABELS: Record<StageType, typeof m.stage_type_open> = {
	open: m.stage_type_open,
	won: m.stage_type_won,
	lost: m.stage_type_lost,
};

export const PIPELINE_LIMITS = {
	pipelinesPerWorkspace: 10,
	stagesPerPipeline: 20,
} as const;

const optionalId = z.union([
	z.literal(""),
	z.uuid({ error: () => m.validation_invalid_id() }),
]);

export const stageInputSchema = z.object({
	// Empty for a new stage; an existing stage of this pipeline otherwise
	id: optionalId,
	name: labelSchema,
	probability: z
		.number()
		.int()
		.min(0, { error: () => m.validation_probability() })
		.max(100, { error: () => m.validation_probability() }),
	type: z.enum(STAGE_TYPES),
});
export type StageInput = z.infer<typeof stageInputSchema>;

// The shape every pipeline must keep: at least one open stage, exactly one won
// and one lost stage. Returns the first problem, or null.
export function stagesProblem(stages: Pick<StageInput, "type">[]) {
	if (stages.length > PIPELINE_LIMITS.stagesPerPipeline)
		return m.validation_stages_max({ max: PIPELINE_LIMITS.stagesPerPipeline });
	const count = (type: StageType) =>
		stages.filter((s) => s.type === type).length;
	if (count("open") < 1) return m.validation_stages_open();
	if (count("won") !== 1) return m.validation_stages_won();
	if (count("lost") !== 1) return m.validation_stages_lost();
	return null;
}

// Won always means 100 %, lost 0 %, whatever was typed
export function normalizedProbability(
	stage: Pick<StageInput, "type" | "probability">,
) {
	if (stage.type === "won") return 100;
	if (stage.type === "lost") return 0;
	return stage.probability;
}

export const pipelineInputSchema = z
	.object({
		name: labelSchema,
		stages: z.array(stageInputSchema).max(PIPELINE_LIMITS.stagesPerPipeline, {
			error: () =>
				m.validation_stages_max({ max: PIPELINE_LIMITS.stagesPerPipeline }),
		}),
	})
	.superRefine((value, ctx) => {
		const problem = stagesProblem(value.stages);
		if (problem)
			ctx.addIssue({ code: "custom", path: ["stages"], message: problem });
	});
export type PipelineInput = z.infer<typeof pipelineInputSchema>;

export const updatePipelineSchema = z
	.object({
		id: z.uuid({ error: () => m.validation_invalid_id() }),
		name: labelSchema,
		stages: z.array(stageInputSchema).max(PIPELINE_LIMITS.stagesPerPipeline, {
			error: () =>
				m.validation_stages_max({ max: PIPELINE_LIMITS.stagesPerPipeline }),
		}),
	})
	.superRefine((value, ctx) => {
		const problem = stagesProblem(value.stages);
		if (problem)
			ctx.addIssue({ code: "custom", path: ["stages"], message: problem });
	});
export type UpdatePipelineInput = z.infer<typeof updatePipelineSchema>;

export const pipelineIdSchema = z.object({
	id: z.uuid({ error: () => m.validation_invalid_id() }),
});

export type PipelineStage = {
	id: string;
	name: Localized;
	position: number;
	probability: number;
	type: StageType;
};
