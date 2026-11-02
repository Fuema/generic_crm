import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/Customers/CustomerFormDialog";
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
import { fromStoredISO, toStoredISO } from "#/lib/calendar";
import { orderNumberLabel } from "#/lib/money";
import {
	TASK_PRIORITIES,
	TASK_STATUSES,
	type TaskInput,
	type TaskPriority,
	type TaskStatus,
	taskInputSchema,
} from "#/lib/schema";
import type { RefOptions, TaskCard } from "#/lib/tasks";
import { OptionSelect, PRIORITY_LABELS, STATUS_LABELS } from "./fields";

export type TaskDraft = { status?: TaskStatus; date?: string };

export function TaskFormDialog({
	open,
	onOpenChange,
	task,
	draft,
	refs,
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
	refs: RefOptions;
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
						{task ? (canEdit ? "Edit task" : "Task") : "New task"}
					</DialogTitle>
					<DialogDescription>
						{canEdit
							? "Tasks with a due date also appear on the calendar."
							: "You have view-only access."}
					</DialogDescription>
				</DialogHeader>
				<TaskForm
					key={task?.id ?? `new-${draft?.status ?? ""}-${draft?.date ?? ""}`}
					task={task}
					draft={draft}
					refs={refs}
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
	refs,
	canEdit,
	canDelete,
	onSave,
	onDelete,
	onCancel,
}: {
	task: TaskCard | null;
	draft?: TaskDraft;
	refs: RefOptions;
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
	const [assigneeId, setAssigneeId] = useState<string | null>(
		task ? task.assigneeId : refs.currentUserId,
	);
	const [date, setDate] = useState(initialDue.date || draft?.date || "");
	const [time, setTime] = useState(initialDue.time);
	const [allDay, setAllDay] = useState(task?.allDay ?? true);
	const [customerId, setCustomerId] = useState<string | null>(
		task?.customerId ?? null,
	);
	const [orderId, setOrderId] = useState<string | null>(task?.orderId ?? null);
	const [errors, setErrors] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);

	const submit = async () => {
		if (!allDay && date && !time) {
			setErrors(["Choose a time, or mark the task as all-day"]);
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
			customerId,
			orderId,
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
		if (!onDelete || !window.confirm("Delete this task? This can't be undone."))
			return;
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
					<Label htmlFor="task-title">Title *</Label>
					<Input
						id="task-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						maxLength={200}
						autoComplete="off"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="task-description">Description</Label>
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
						label="Status"
						value={status}
						onChange={(v) => setStatus((v ?? "todo") as TaskStatus)}
						options={TASK_STATUSES.map((s) => ({
							value: s,
							label: STATUS_LABELS[s],
						}))}
						disabled={!canEdit}
					/>
					<OptionSelect
						id="task-priority"
						label="Priority"
						value={priority}
						onChange={(v) => setPriority((v ?? "medium") as TaskPriority)}
						options={TASK_PRIORITIES.map((p) => ({
							value: p,
							label: PRIORITY_LABELS[p],
						}))}
						disabled={!canEdit}
					/>
					<OptionSelect
						id="task-assignee"
						label="Assignee"
						value={assigneeId}
						onChange={setAssigneeId}
						noneLabel="Unassigned"
						options={refs.members.map((m) => ({
							value: m.id,
							label: m.id === refs.currentUserId ? `${m.name} (me)` : m.name,
						}))}
						disabled={!canEdit}
					/>
				</div>
				<div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
					<div className="space-y-2">
						<Label htmlFor="task-date">Due date</Label>
						<Input
							id="task-date"
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="task-time">Time</Label>
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
							All day
						</Label>
					</div>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<OptionSelect
						id="task-customer"
						label="Customer"
						value={customerId}
						onChange={setCustomerId}
						noneLabel="No customer"
						options={refs.customers.map((c) => ({
							value: c.id,
							label: c.name,
						}))}
						disabled={!canEdit}
					/>
					<OptionSelect
						id="task-order"
						label="Order"
						value={orderId}
						onChange={setOrderId}
						noneLabel="No order"
						options={refs.orders.map((o) => ({
							value: o.id,
							label: `${orderNumberLabel(o.number)} · ${o.customerName}`,
						}))}
						disabled={!canEdit}
					/>
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
						Delete
					</Button>
				) : (
					<span />
				)}
				<div className="flex gap-2">
					<Button type="button" variant="ghost" onClick={onCancel}>
						{canEdit ? "Cancel" : "Close"}
					</Button>
					{canEdit ? (
						<Button type="submit" disabled={busy}>
							{busy ? "Saving..." : task ? "Save task" : "Create task"}
						</Button>
					) : null}
				</div>
			</DialogFooter>
		</form>
	);
}
