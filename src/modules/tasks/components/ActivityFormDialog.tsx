import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
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
import { Textarea } from "#/components/ui/textarea";
import { OptionSelect } from "#/modules/contacts/components/fields";
import { m } from "#/paraglide/messages.js";
import { fromStoredISO, toStoredISO } from "../calendar";
import {
	ACTIVITY_TYPE_LABELS,
	ACTIVITY_TYPES,
	type ActivityInput,
	type ActivityType,
	activityInputSchema,
} from "../schema";
import type { CalendarActivity, WorkOptions } from "../tasks";
import { NO_SUBJECT, type PickedSubject, SubjectPicker } from "./SubjectPicker";
import { memberOptions, pickedSubjectOf } from "./TaskFormDialog";

// What a new activity starts with: a day, the record page it's logged on
export type ActivityDraft = {
	date?: string;
	subject?: PickedSubject;
	projectId?: string;
};

export function ActivityFormDialog({
	open,
	onOpenChange,
	activity,
	draft,
	options,
	canEdit,
	canDelete,
	onSave,
	onDelete,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	activity: CalendarActivity | null;
	draft?: ActivityDraft;
	options: WorkOptions;
	canEdit: boolean;
	canDelete: boolean;
	onSave: (value: ActivityInput) => Promise<void>;
	onDelete?: () => Promise<void>;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{activity
							? canEdit
								? m.activity_edit_title()
								: m.activity_view_title()
							: m.activity_new_title()}
					</DialogTitle>
					<DialogDescription>
						{m.activity_dialog_description()}
					</DialogDescription>
				</DialogHeader>
				<ActivityForm
					key={activity?.id ?? `new-${draft?.date ?? ""}`}
					activity={activity}
					draft={draft}
					options={options}
					canEdit={canEdit}
					canDelete={canDelete}
					onSave={onSave}
					onDelete={onDelete}
					onCancel={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}

function ActivityForm({
	activity,
	draft,
	options,
	canEdit,
	canDelete,
	onSave,
	onDelete,
	onCancel,
}: {
	activity: CalendarActivity | null;
	draft?: ActivityDraft;
	options: WorkOptions;
	canEdit: boolean;
	canDelete: boolean;
	onSave: (value: ActivityInput) => Promise<void>;
	onDelete?: () => Promise<void>;
	onCancel: () => void;
}) {
	const start = fromStoredISO(
		activity?.startsAt ?? null,
		activity?.allDay ?? false,
	);
	const end = fromStoredISO(
		activity?.endsAt ?? null,
		activity?.allDay ?? false,
	);
	const [type, setType] = useState<ActivityType>(
		(activity?.type as ActivityType) ?? "call",
	);
	const [subjectText, setSubjectText] = useState(activity?.subject ?? "");
	const [notes, setNotes] = useState(activity?.notes ?? "");
	const [date, setDate] = useState(start.date || draft?.date || "");
	const [startTime, setStartTime] = useState(start.time || "09:00");
	const [endTime, setEndTime] = useState(end.time || "");
	const [allDay, setAllDay] = useState(activity?.allDay ?? false);
	const [completed, setCompleted] = useState(activity?.completed ?? false);
	const [ownerId, setOwnerId] = useState(
		activity ? (activity.ownerId ?? "") : options.currentUserId,
	);
	const [subject, setSubject] = useState<PickedSubject>(
		activity ? pickedSubjectOf(activity) : (draft?.subject ?? NO_SUBJECT),
	);
	const [projectId, setProjectId] = useState(
		activity ? (activity.projectId ?? "") : (draft?.projectId ?? ""),
	);
	const [errors, setErrors] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);

	const projects =
		activity?.projectId &&
		!options.projects.some((p) => p.id === activity.projectId)
			? [
					...options.projects,
					{
						id: activity.projectId,
						name: activity.projectName ?? activity.projectId,
					},
				]
			: options.projects;

	const submit = async () => {
		if (!date) {
			setErrors([m.activity_date_required()]);
			return;
		}
		const parsed = activityInputSchema.safeParse({
			type,
			subject: subjectText,
			notes,
			startsAt: toStoredISO(date, startTime, allDay),
			endsAt: !allDay && endTime ? toStoredISO(date, endTime, false) : null,
			allDay,
			completed,
			ownerId,
			subjectType: subject.type,
			subjectId: subject.id,
			projectId,
		});
		if (!parsed.success) {
			setErrors([...new Set(parsed.error.issues.map((i) => i.message))]);
			return;
		}
		setErrors([]);
		setBusy(true);
		try {
			await onSave(parsed.data);
		} catch (e) {
			setErrors([await serverErrorMessage(e)]);
		} finally {
			setBusy(false);
		}
	};

	const remove = async () => {
		if (!onDelete || !window.confirm(m.activity_delete_confirm())) return;
		setBusy(true);
		try {
			await onDelete();
		} catch (e) {
			setErrors([await serverErrorMessage(e)]);
			setBusy(false);
		}
	};

	return (
		<form
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
			className="space-y-4"
		>
			{errors.length ? <FormAlert message={errors.join(" ")} /> : null}
			<fieldset disabled={!canEdit || busy} className="space-y-4">
				<div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
					<OptionSelect
						id="activity-type"
						label={m.activity_type()}
						value={type}
						onChange={(v) => setType((v || "call") as ActivityType)}
						options={ACTIVITY_TYPES.map((t) => ({
							value: t,
							label: ACTIVITY_TYPE_LABELS[t](),
						}))}
					/>
					<div className="space-y-2">
						<Label htmlFor="activity-subject">{m.activity_subject()}</Label>
						<Input
							id="activity-subject"
							value={subjectText}
							onChange={(e) => setSubjectText(e.target.value)}
							maxLength={200}
							autoComplete="off"
							required
						/>
					</div>
				</div>
				<div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
					<div className="space-y-2">
						<Label htmlFor="activity-date">{m.activity_date()}</Label>
						<Input
							id="activity-date"
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="activity-start">{m.activity_start()}</Label>
						<Input
							id="activity-start"
							type="time"
							value={allDay ? "" : startTime}
							onChange={(e) => setStartTime(e.target.value)}
							disabled={allDay}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="activity-end">{m.activity_end()}</Label>
						<Input
							id="activity-end"
							type="time"
							value={allDay ? "" : endTime}
							onChange={(e) => setEndTime(e.target.value)}
							disabled={allDay}
						/>
					</div>
					<div className="flex h-9 items-center gap-2">
						<Checkbox
							id="activity-allday"
							checked={allDay}
							onCheckedChange={(c) => setAllDay(c === true)}
						/>
						<Label htmlFor="activity-allday" className="font-normal">
							{m.work_all_day()}
						</Label>
					</div>
				</div>
				<SubjectPicker
					idPrefix="activity"
					value={subject}
					onChange={setSubject}
					invalid={errors.length > 0 && subject.type !== "" && !subject.id}
				/>
				<div className="grid gap-4 sm:grid-cols-2">
					<OptionSelect
						id="activity-project"
						label={m.work_project()}
						value={projectId}
						onChange={setProjectId}
						emptyLabel={m.work_no_project()}
						options={projects.map((p) => ({ value: p.id, label: p.name }))}
					/>
					<OptionSelect
						id="activity-owner"
						label={m.activity_owner()}
						value={ownerId}
						onChange={setOwnerId}
						emptyLabel={m.activity_nobody()}
						options={memberOptions(options)}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="activity-notes">{m.activity_notes()}</Label>
					<Textarea
						id="activity-notes"
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						maxLength={5000}
						rows={3}
					/>
				</div>
				<div className="flex items-center gap-2">
					<Checkbox
						id="activity-done"
						checked={completed}
						onCheckedChange={(c) => setCompleted(c === true)}
					/>
					<Label htmlFor="activity-done" className="font-normal">
						{m.activity_done()}
					</Label>
				</div>
			</fieldset>
			<DialogFooter className="gap-2 sm:justify-between">
				{activity && canDelete && onDelete ? (
					<Button
						type="button"
						variant="destructive"
						onClick={remove}
						disabled={busy}
					>
						{m.work_delete()}
					</Button>
				) : (
					<span />
				)}
				<div className="flex gap-2">
					<Button type="button" variant="ghost" onClick={onCancel}>
						{canEdit ? m.common_cancel() : m.work_close()}
					</Button>
					{canEdit ? (
						<Button type="submit" disabled={busy}>
							{busy
								? m.common_saving()
								: activity
									? m.activity_save()
									: m.activity_create()}
						</Button>
					) : null}
				</div>
			</DialogFooter>
		</form>
	);
}
