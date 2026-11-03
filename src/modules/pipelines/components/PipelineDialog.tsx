import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { OptionSelect } from "#/modules/contacts/components/fields";
import { LocalizedInputs } from "#/modules/fields/components/FieldDialogs";
import { localized } from "#/modules/fields/schema";
import { m } from "#/paraglide/messages.js";
import { createPipeline, type Pipelines, updatePipeline } from "../pipelines";
import {
	normalizedProbability,
	PIPELINE_LIMITS,
	STAGE_TYPE_LABELS,
	STAGE_TYPES,
	type StageInput,
	stagesProblem,
} from "../schema";

type Pipeline = Pipelines[number];

// Stored names are { en, es }: take both languages from the message files
const both = (message: typeof m.stage_type_open) => ({
	en: message({}, { locale: "en" }),
	es: message({}, { locale: "es" }),
});

// A new pipeline starts with the shape every pipeline needs
const starterStages = (): StageInput[] => [
	{ id: "", name: both(m.pipeline_starter_new), probability: 10, type: "open" },
	{ id: "", name: both(m.stage_type_won), probability: 100, type: "won" },
	{ id: "", name: both(m.stage_type_lost), probability: 0, type: "lost" },
];

// Create or edit a pipeline: its name and the ordered list of stages
export function PipelineDialog({
	open,
	onOpenChange,
	pipeline,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pipeline: Pipeline | null;
	onSaved: (name: string) => Promise<void>;
}) {
	const [name, setName] = useState(pipeline?.name ?? { en: "", es: "" });
	const [stages, setStages] = useState<StageInput[]>(
		pipeline
			? pipeline.stages.map((s) => ({
					id: s.id,
					name: s.name,
					probability: s.probability,
					type: s.type,
				}))
			: starterStages(),
	);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const removedExisting = pipeline
		? pipeline.stages.filter((s) => !stages.some((x) => x.id === s.id)).length
		: 0;

	const patch = (i: number, value: Partial<StageInput>) =>
		setStages((list) => list.map((s, j) => (j === i ? { ...s, ...value } : s)));
	const move = (i: number, delta: -1 | 1) =>
		setStages((list) => {
			const next = [...list];
			const j = i + delta;
			if (j < 0 || j >= next.length) return list;
			[next[i], next[j]] = [next[j], next[i]];
			return next;
		});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{pipeline ? m.pipeline_edit_title() : m.pipeline_new_title()}
					</DialogTitle>
					<DialogDescription>{m.pipeline_form_description()}</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="space-y-5"
					onSubmit={async (e) => {
						e.preventDefault();
						setError(null);
						const problem = stagesProblem(stages);
						if (problem) {
							setError(problem);
							return;
						}
						setBusy(true);
						try {
							if (pipeline)
								await updatePipeline({
									data: { id: pipeline.id, name, stages },
								});
							else await createPipeline({ data: { name, stages } });
							await onSaved(localized(name));
						} catch (err) {
							setError(await serverErrorMessage(err));
						} finally {
							setBusy(false);
						}
					}}
				>
					<FormAlert message={error} />
					<LocalizedInputs
						id="pipeline-name"
						labels={[m.pipeline_name_en(), m.pipeline_name_es()]}
						value={name}
						onChange={setName}
						maxLength={60}
					/>

					<fieldset className="space-y-3">
						<legend className="text-sm font-semibold">
							{m.pipeline_stages()}
						</legend>
						<ol className="space-y-3">
							{stages.map((stage, i) => {
								const id = `stage-${i}`;
								const fixed = stage.type !== "open";
								return (
									<li
										key={stage.id || `new-${i}`}
										className="space-y-3 rounded-md border p-3"
									>
										<div className="flex items-center justify-between gap-2">
											<span className="text-xs text-muted-foreground">
												{m.pipeline_stage_number({ n: i + 1 })}
											</span>
											<div className="flex gap-1">
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={m.pipeline_stage_up()}
													disabled={i === 0}
													onClick={() => move(i, -1)}
												>
													<ArrowUp />
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={m.pipeline_stage_down()}
													disabled={i === stages.length - 1}
													onClick={() => move(i, 1)}
												>
													<ArrowDown />
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													aria-label={m.pipeline_stage_remove()}
													onClick={() =>
														setStages((list) => list.filter((_, j) => j !== i))
													}
												>
													<Trash2 />
												</Button>
											</div>
										</div>
										<LocalizedInputs
											id={`${id}-name`}
											labels={[m.pipeline_name_en(), m.pipeline_name_es()]}
											value={stage.name}
											onChange={(v) => patch(i, { name: v })}
											maxLength={60}
										/>
										<div className="grid gap-3 sm:grid-cols-2">
											<OptionSelect
												id={`${id}-type`}
												label={m.pipeline_stage_type()}
												value={stage.type}
												onChange={(v) =>
													patch(i, { type: v as StageInput["type"] })
												}
												options={STAGE_TYPES.map((t) => ({
													value: t,
													label: STAGE_TYPE_LABELS[t](),
												}))}
											/>
											<div className="space-y-2">
												<Label htmlFor={`${id}-probability`}>
													{m.pipeline_stage_probability()}
												</Label>
												<Input
													id={`${id}-probability`}
													type="number"
													min={0}
													max={100}
													step={1}
													disabled={fixed}
													value={normalizedProbability(stage)}
													onChange={(e) =>
														patch(i, {
															probability: Math.max(
																0,
																Math.min(
																	100,
																	Math.round(Number(e.target.value) || 0),
																),
															),
														})
													}
												/>
											</div>
										</div>
									</li>
								);
							})}
						</ol>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={stages.length >= PIPELINE_LIMITS.stagesPerPipeline}
							onClick={() =>
								setStages((list) => {
									// New open stages go before the won and lost ones
									const at = list.findIndex((s) => s.type !== "open");
									const next = [...list];
									next.splice(at < 0 ? next.length : at, 0, {
										id: "",
										name: { en: "", es: "" },
										probability: 50,
										type: "open",
									});
									return next;
								})
							}
						>
							<Plus /> {m.pipeline_stage_add()}
						</Button>
						{removedExisting ? (
							<p className="text-xs text-muted-foreground">
								{m.pipeline_stages_archived_note({ count: removedExisting })}
							</p>
						) : null}
					</fieldset>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							{m.common_cancel()}
						</Button>
						<Button type="submit" disabled={busy}>
							{busy
								? m.common_saving()
								: pipeline
									? m.common_save_changes()
									: m.pipeline_create()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
