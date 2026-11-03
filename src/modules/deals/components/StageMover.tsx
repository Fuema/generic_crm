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
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { localized } from "#/modules/fields/schema";
import type { PipelineStage } from "#/modules/pipelines/schema";
import { m } from "#/paraglide/messages.js";
import { moveDeal } from "../deals";
import { lostReasonProblem } from "../schema";

// A stage picker for one deal. Choosing a lost stage first asks for the reason.
export function StageMover({
	dealId,
	dealName,
	stageId,
	stages,
	disabled,
	onMoved,
	onError,
}: {
	dealId: string;
	dealName: string;
	stageId: string;
	stages: PipelineStage[];
	disabled?: boolean;
	onMoved: (stageName: string) => Promise<void>;
	onError: (message: string) => void;
}) {
	const [pending, setPending] = useState<PipelineStage | null>(null);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const current = stages.some((s) => s.id === stageId) ? stageId : "";

	const move = async (stage: PipelineStage, lostReason: string) => {
		setBusy(true);
		try {
			await moveDeal({ data: { id: dealId, stageId: stage.id, lostReason } });
			setPending(null);
			await onMoved(localized(stage.name));
		} catch (e) {
			const message = await serverErrorMessage(e);
			if (pending) setError(message);
			else onError(message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<Select
				value={current}
				disabled={disabled || busy}
				onValueChange={(v) => {
					const stage = stages.find((s) => s.id === v);
					if (!stage || stage.id === stageId) return;
					if (stage.type === "lost") {
						setReason("");
						setError(null);
						setPending(stage);
					} else void move(stage, "");
				}}
			>
				<SelectTrigger
					className="h-8 w-full text-xs"
					aria-label={m.deal_move_label({ name: dealName })}
				>
					<SelectValue placeholder={m.deal_stage()} />
				</SelectTrigger>
				<SelectContent>
					{stages.map((s) => (
						<SelectItem key={s.id} value={s.id}>
							{localized(s.name)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Dialog
				open={Boolean(pending)}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{m.deal_lost_title({ name: dealName })}</DialogTitle>
						<DialogDescription>{m.deal_lost_description()}</DialogDescription>
					</DialogHeader>
					<form
						noValidate
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							const problem = lostReasonProblem("lost", reason);
							if (problem) {
								setError(problem);
								return;
							}
							if (pending) void move(pending, reason);
						}}
					>
						<FormAlert message={error} />
						<div className="space-y-2">
							<Label htmlFor={`lost-reason-${dealId}`}>
								{m.deal_lost_reason()}
							</Label>
							<Textarea
								id={`lost-reason-${dealId}`}
								value={reason}
								maxLength={500}
								autoFocus
								onChange={(e) => setReason(e.target.value)}
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setPending(null)}
							>
								{m.common_cancel()}
							</Button>
							<Button type="submit" disabled={busy}>
								{m.deal_mark_lost()}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
