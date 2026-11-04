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
	TASK_PRIORITIES,
	TASK_PRIORITY_LABELS,
	TASK_STATUS_LABELS,
	TASK_STATUSES,
	type TaskInput,
	type TaskPriority,
	type TaskStatus,
	taskInputSchema,
} from "../schema";
import type { TaskCard, WorkOptions } from "../tasks";
import { NO_SUBJECT, type PickedSubject, SubjectPicker } from "./SubjectPicker";
import { isSubjectType, subjectLabel } from "./WorkBits";

// What a new task starts with: a column, a day, the record page it's made on
export type TaskDraft = {
	status?: TaskStatus;
	date?: string;
	subject?: PickedSubject;
	projectId?: string;
};

export function memberOptions(options: WorkOptions) {
	return options.members.map((p) => ({
		value: p.id,
		label:
			p.id === options.currentUserId
				? m.work_member_me({ name: p.name })
				: p.name,
	}));
}

export function pickedSubjectOf(row: {
	subjectType: string | null;
	subjectId: string | null;
	subjectName?: string | null;
	subjectNumber?: number | null;
	subjectYear?: number | null;
}): PickedSubject {
	if (!row.subjectId || !isSubjectType(row.subjectType)) return NO_SUBJECT;
	return {
		type: row.subjectType,
		id: row.subjectId,
		label: subjectLabel(row.subjectType, row),
	};
}

export function TaskFormDialog({
	open,
	onOpenChange,
	task,
	draft,
	options,
	canEdit,
	canDelete,
	onSave,
	onDelete,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// null = new task, prefilled from draft
	task: TaskCard | null;
	draft?: TaskDraft;
	options: WorkOptions;
	canEdit: boolean;
	canDelete: boolean;
	onSave: (value: TaskInput) => Promise<void>;
	onDelete?: () => Promise<void>;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{task
							? canEdit
								? m.task_edit_title()
								: m.task_view_title()
							: m.task_new_title()}
					</DialogTitle>
					<DialogDescription>
						{canEdit ? m.task_dialog_description() : m.common_view_only()}
					</DialogDescription>
				</DialogHeader>
				<TaskForm
					key={task?.id ?? `new-${draft?.status ?? ""}-${draft?.date ?? ""}`}
					task={task}
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

function TaskForm({
	task,
	draft,
	options,
	canEdit,
	canDelete,
	onSave,
	onDelete,
	onCancel,
}: {
	task: TaskCard | null;
	draft?: TaskDraft;
	options: WorkOptions;
	canEdit: boolean;
	canDelete: boolean;
	onSave: (value: TaskInput) => Promise<void>;
	onDelete?: () => Promise<void>;
	onCancel: () => void;
}) {
	const initialDue = fromStoredISO(task?.dueAt ?? null, task?.allDay ?? true);
	const [title, setTitle] = useState(task?.title ?? "");
	const [description, setDescription] = useState(task?.description ?? "");
	const [status, setStatus] = useState<TaskStatus>(
		(task?.status as TaskStatus) ?? draft?.status ?? "todo",
	);
	const [priority, setPriority] = useState<TaskPriority>(
		(task?.priority as TaskPriority) ?? "medium",
	);
	const [assigneeId, setAssigneeId] = useState(
		task ? (task.assigneeId ?? "") : options.currentUserId,
	);
	const [date, setDate] = useState(initialDue.date || draft?.date || "");
	const [time, setTime] = useState(initialDue.time);
	const [allDay, setAllDay] = useState(task?.allDay ?? true);
	const [subject, setSubject] = useState<PickedSubject>(
		task ? pickedSubjectOf(task) : (draft?.subject ?? NO_SUBJECT),
	);
	const [projectId, setProjectId] = useState(
		task ? (task.projectId ?? "") : (draft?.projectId ?? ""),
	);
	const [isMilestone, setIsMilestone] = useState(task?.isMilestone ?? false);
	const [errors, setErrors] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);

	// An archived project stays selectable while the task still points to it
	const projects =
		task?.projectId && !options.projects.some((p) => p.id === task.projectId)
			? [
					...options.projects,
					{ id: task.projectId, name: task.projectName ?? task.projectId },
				]
			: options.projects;

	const submit = async () => {
		if (!allDay && date && !time) {
			setErrors([m.work_time_required()]);
			return;
		}
		const parsed = taskInputSchema.safeParse({
			title,
			description,
			status,
			priority,
			assigneeId,
			dueAt: date ? toStoredISO(date, time, allDay) : null,
			allDay,
			isMilestone,
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
		if (!onDelete || !window.confirm(m.task_delete_confirm())) return;
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
				<div className="space-y-2">
					<Label htmlFor="task-title">{m.task_title_label()}</Label>
					<Input
						id="task-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						maxLength={200}
						autoComplete="off"
						required
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="task-description">{m.task_description()}</Label>
					<Textarea
						id="task-description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						maxLength={5000}
						rows={3}
					/>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					<OptionSelect
						id="task-status"
						label={m.task_status()}
						value={status}
						onChange={(v) => setStatus((v || "todo") as TaskStatus)}
						options={TASK_STATUSES.map((s) => ({
							value: s,
							label: TASK_STATUS_LABELS[s](),
						}))}
					/>
					<OptionSelect
						id="task-priority"
						label={m.task_priority()}
						value={priority}
						onChange={(v) => setPriority((v || "medium") as TaskPriority)}
						options={TASK_PRIORITIES.map((p) => ({
							value: p,
							label: TASK_PRIORITY_LABELS[p](),
						}))}
					/>
					<OptionSelect
						id="task-assignee"
						label={m.task_assignee()}
						value={assigneeId}
						onChange={setAssigneeId}
						emptyLabel={m.task_unassigned()}
						options={memberOptions(options)}
					/>
				</div>
				<div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
					<div className="space-y-2">
						<Label htmlFor="task-date">{m.task_due_date()}</Label>
						<Input
							id="task-date"
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="task-time">{m.work_time()}</Label>
						<Input
							id="task-time"
							type="time"
							value={allDay ? "" : time}
							onChange={(e) => setTime(e.target.value)}
							disabled={allDay || !date}
						/>
					</div>
					<div className="flex h-9 items-center gap-2">
						<Checkbox
							id="task-allday"
							checked={allDay}
							onCheckedChange={(c) => setAllDay(c === true)}
						/>
						<Label htmlFor="task-allday" className="font-normal">
							{m.work_all_day()}
						</Label>
					</div>
				</div>
				<SubjectPicker
					idPrefix="task"
					value={subject}
					onChange={setSubject}
					invalid={errors.length > 0 && subject.type !== "" && !subject.id}
				/>
				<div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
					<OptionSelect
						id="task-project"
						label={m.work_project()}
						value={projectId}
						onChange={(v) => {
							setProjectId(v);
							if (!v) setIsMilestone(false);
						}}
						emptyLabel={m.work_no_project()}
						options={projects.map((p) => ({ value: p.id, label: p.name }))}
					/>
					<div className="flex h-9 items-center gap-2">
						<Checkbox
							id="task-milestone"
							checked={isMilestone}
							disabled={!projectId}
							onCheckedChange={(c) => setIsMilestone(c === true)}
						/>
						<Label htmlFor="task-milestone" className="font-normal">
							{m.task_milestone()}
						</Label>
					</div>
				</div>
			</fieldset>
			<DialogFooter className="gap-2 sm:justify-between">
				{task && canDelete && onDelete ? (
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
								: task
									? m.task_save()
									: m.task_create()}
						</Button>
					) : null}
				</div>
			</DialogFooter>
		</form>
	);
}
