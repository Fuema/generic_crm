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
import type { CalendarActivity } from "#/lib/activities";
import { fromStoredISO, toStoredISO } from "#/lib/calendar";
import { orderNumberLabel } from "#/lib/money";
import {
	ACTIVITY_TYPES,
	type ActivityInput,
	type ActivityType,
	activityInputSchema,
} from "#/lib/schema";
import type { RefOptions } from "#/lib/tasks";
import { OptionSelect } from "./fields";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
	call: "Call",
	meeting: "Meeting",
	email: "Email",
	follow_up: "Follow-up",
};

export function ActivityFormDialog({
	open,
	onOpenChange,
	activity,
	date,
	refs,
	canEdit,
	canDelete,
	onSave,
	onDelete,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	activity: CalendarActivity | null;
	// Prefill date for a new activity (YYYY-MM-DD)
	date?: string;
	refs: RefOptions;
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
								? "Edit activity"
								: "Activity"
							: "Log activity"}
					</DialogTitle>
					<DialogDescription>
						Calls, meetings, emails and follow-ups with your customers.
					</DialogDescription>
				</DialogHeader>
				<ActivityForm
					key={activity?.id ?? `new-${date ?? ""}`}
					activity={activity}
					date={date}
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

function ActivityForm({
	activity,
	date: prefillDate,
	refs,
	canEdit,
	canDelete,
	onSave,
	onDelete,
	onCancel,
}: {
	activity: CalendarActivity | null;
	date?: string;
	refs: RefOptions;
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
	const [subject, setSubject] = useState(activity?.subject ?? "");
	const [notes, setNotes] = useState(activity?.notes ?? "");
	const [date, setDate] = useState(start.date || prefillDate || "");
	const [startTime, setStartTime] = useState(start.time || "09:00");
	const [endTime, setEndTime] = useState(end.time || "");
	const [allDay, setAllDay] = useState(activity?.allDay ?? false);
	const [completed, setCompleted] = useState(activity?.completed ?? false);
	const [ownerId, setOwnerId] = useState<string | null>(
		activity ? activity.ownerId : refs.currentUserId,
	);
	const [customerId, setCustomerId] = useState<string | null>(
		activity?.customerId ?? null,
	);
	const [orderId, setOrderId] = useState<string | null>(
		activity?.orderId ?? null,
	);
	const [errors, setErrors] = useState<string[]>([]);
	const [busy, setBusy] = useState(false);

	const submit = async () => {
		if (!date) {
			setErrors(["Choose a date"]);
			return;
		}
		const parsed = activityInputSchema.safeParse({
			type,
			subject,
			notes,
			startsAt: toStoredISO(date, startTime, allDay),
			endsAt: !allDay && endTime ? toStoredISO(date, endTime, false) : null,
			allDay,
			completed,
			ownerId,
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
		if (
			!onDelete ||
			!window.confirm("Delete this activity? This can't be undone.")
		)
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
				<div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
					<OptionSelect
						id="activity-type"
						label="Type"
						value={type}
						onChange={(v) => setType((v ?? "call") as ActivityType)}
						options={ACTIVITY_TYPES.map((t) => ({
							value: t,
							label: ACTIVITY_LABELS[t],
						}))}
						disabled={!canEdit}
					/>
					<div className="space-y-2">
						<Label htmlFor="activity-subject">Subject *</Label>
						<Input
							id="activity-subject"
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							maxLength={200}
							autoComplete="off"
						/>
					</div>
				</div>
				<div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
					<div className="space-y-2">
						<Label htmlFor="activity-date">Date *</Label>
						<Input
							id="activity-date"
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="activity-start">Start</Label>
						<Input
							id="activity-start"
							type="time"
							value={allDay ? "" : startTime}
							onChange={(e) => setStartTime(e.target.value)}
							disabled={allDay}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="activity-end">End</Label>
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
							All day
						</Label>
					</div>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					<OptionSelect
						id="activity-owner"
						label="Owner"
						value={ownerId}
						onChange={setOwnerId}
						noneLabel="Nobody"
						options={refs.members.map((m) => ({
							value: m.id,
							label: m.id === refs.currentUserId ? `${m.name} (me)` : m.name,
						}))}
						disabled={!canEdit}
					/>
					<OptionSelect
						id="activity-customer"
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
						id="activity-order"
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
				<div className="space-y-2">
					<Label htmlFor="activity-notes">Notes</Label>
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
						Done
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
							{busy ? "Saving..." : activity ? "Save activity" : "Log activity"}
						</Button>
					) : null}
				</div>
			</DialogFooter>
		</form>
	);
}
