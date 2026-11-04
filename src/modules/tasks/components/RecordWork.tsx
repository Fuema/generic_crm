import { useRouter } from "@tanstack/react-router";
import { CalendarPlus, Flag, Plus } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { roleCan } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import { formatTime } from "../calendar";
import {
	ACTIVITY_TYPE_LABELS,
	type ActivityType,
	TASK_STATUS_LABELS,
	type TaskStatus,
	type WorkSubjectType,
} from "../schema";
import {
	type CalendarActivity,
	createActivity,
	createTask,
	deleteActivity,
	deleteTask,
	getWorkOptions,
	type RecordWork as RecordWorkData,
	type TaskCard,
	updateActivity,
	updateTask,
	type WorkOptions,
} from "../tasks";
import { ActivityFormDialog } from "./ActivityFormDialog";
import { TaskFormDialog } from "./TaskFormDialog";
import { dueLabel, PriorityBadge } from "./WorkBits";

type Dialog =
	| { kind: "task"; task: TaskCard | null }
	| { kind: "activity"; activity: CalendarActivity | null };

function activityWhen(a: CalendarActivity) {
	const day = new Date(a.startsAt).toLocaleDateString(getLocale(), {
		month: "short",
		day: "numeric",
		year: "numeric",
		...(a.allDay ? { timeZone: "UTC" } : {}),
	});
	return a.allDay ? day : `${day} ${formatTime(a.startsAt)}`;
}

// The open tasks and the latest activities of a record, on its page. New ones
// start linked to the record (or, on a project page, to the project).
export function RecordWork({
	subjectType,
	subjectId,
	label,
	work,
	role,
	archived = false,
}: {
	subjectType: WorkSubjectType | "project";
	subjectId: string;
	// What the record is called, for the form's record field
	label: string;
	work: RecordWorkData;
	role: string | undefined;
	archived?: boolean;
}) {
	const router = useRouter();
	const [options, setOptions] = useState<WorkOptions | null>(null);
	const [dialog, setDialog] = useState<Dialog | null>(null);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const can = {
		createTask: !archived && roleCan(role, { task: ["create"] }),
		updateTask: roleCan(role, { task: ["update"] }),
		deleteTask: roleCan(role, { task: ["delete"] }),
		createActivity: !archived && roleCan(role, { activity: ["create"] }),
		updateActivity: roleCan(role, { activity: ["update"] }),
		deleteActivity: roleCan(role, { activity: ["delete"] }),
	};

	// The forms need people and projects; fetched the first time one opens
	const open = async (next: Dialog) => {
		setStatus(null);
		try {
			if (!options) setOptions(await getWorkOptions());
			setDialog(next);
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};
	const done = async (message: string) => {
		setDialog(null);
		setStatus({ ok: true, message });
		await router.invalidate();
	};

	const draft =
		subjectType === "project"
			? { projectId: subjectId }
			: { subject: { type: subjectType, id: subjectId, label } };

	return (
		<Card>
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
				<CardTitle>{m.work_card_title()}</CardTitle>
				<div className="flex gap-2">
					{can.createTask ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => open({ kind: "task", task: null })}
						>
							<Plus /> {m.task_new_title()}
						</Button>
					) : null}
					{can.createActivity ? (
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => open({ kind: "activity", activity: null })}
						>
							<CalendarPlus /> {m.activity_new_title()}
						</Button>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				<FormAlert
					message={status?.message ?? null}
					variant={status?.ok ? "success" : "destructive"}
				/>
				<section aria-labelledby={`work-tasks-${subjectId}`}>
					<h3
						id={`work-tasks-${subjectId}`}
						className="mb-1 text-sm font-semibold"
					>
						{m.nav_tasks()}
					</h3>
					{work.tasks.length ? (
						<ul className="divide-y">
							{work.tasks.map((t) => {
								const due = dueLabel(t);
								return (
									<li key={t.id}>
										<button
											type="button"
											onClick={() => open({ kind: "task", task: t })}
											className="flex w-full flex-wrap items-center gap-2 py-2 text-left hover:bg-muted/50"
										>
											{t.isMilestone ? (
												<Flag
													className="size-4 shrink-0 text-muted-foreground"
													aria-label={m.task_milestone()}
												/>
											) : null}
											<span
												className={`min-w-0 flex-1 text-sm font-medium ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}
											>
												{t.title}
											</span>
											<span className="text-xs text-muted-foreground">
												{TASK_STATUS_LABELS[t.status as TaskStatus]?.() ??
													t.status}
											</span>
											{due ? (
												<span
													className={`text-xs ${due.overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
												>
													{due.overdue ? `${m.task_overdue()} · ` : ""}
													{due.text}
												</span>
											) : null}
											<PriorityBadge priority={t.priority} />
										</button>
									</li>
								);
							})}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground">
							{m.work_no_tasks_here()}
						</p>
					)}
				</section>
				<section aria-labelledby={`work-activities-${subjectId}`}>
					<h3
						id={`work-activities-${subjectId}`}
						className="mb-1 text-sm font-semibold"
					>
						{m.work_activities()}
					</h3>
					{work.activities.length ? (
						<ul className="divide-y">
							{work.activities.map((a) => (
								<li key={a.id}>
									<button
										type="button"
										onClick={() => open({ kind: "activity", activity: a })}
										className="flex w-full flex-wrap items-center gap-2 py-2 text-left hover:bg-muted/50"
									>
										<span className="text-xs text-muted-foreground">
											{ACTIVITY_TYPE_LABELS[a.type as ActivityType]?.() ??
												a.type}
										</span>
										<span
											className={`min-w-0 flex-1 text-sm font-medium ${a.completed ? "text-muted-foreground line-through" : ""}`}
										>
											{a.subject}
										</span>
										<span className="text-xs text-muted-foreground">
											{activityWhen(a)}
										</span>
									</button>
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground">
							{m.work_no_activities_here()}
						</p>
					)}
				</section>
			</CardContent>

			{options && dialog?.kind === "task" ? (
				<TaskFormDialog
					open
					onOpenChange={(o) => !o && setDialog(null)}
					task={dialog.task}
					draft={draft}
					options={options}
					canEdit={dialog.task ? can.updateTask : can.createTask}
					canDelete={can.deleteTask}
					onSave={async (value) => {
						if (dialog.task)
							await updateTask({ data: { id: dialog.task.id, ...value } });
						else await createTask({ data: value });
						await done(dialog.task ? m.task_saved() : m.task_created());
					}}
					onDelete={
						dialog.task
							? async () => {
									await deleteTask({ data: { id: dialog.task?.id as string } });
									await done(m.task_deleted());
								}
							: undefined
					}
				/>
			) : null}
			{options && dialog?.kind === "activity" ? (
				<ActivityFormDialog
					open
					onOpenChange={(o) => !o && setDialog(null)}
					activity={dialog.activity}
					draft={draft}
					options={options}
					canEdit={dialog.activity ? can.updateActivity : can.createActivity}
					canDelete={can.deleteActivity}
					onSave={async (value) => {
						if (dialog.activity)
							await updateActivity({
								data: { id: dialog.activity.id, ...value },
							});
						else await createActivity({ data: value });
						await done(
							dialog.activity ? m.activity_saved() : m.activity_created(),
						);
					}}
					onDelete={
						dialog.activity
							? async () => {
									await deleteActivity({
										data: { id: dialog.activity?.id as string },
									});
									await done(m.activity_deleted());
								}
							: undefined
					}
				/>
			) : null}
		</Card>
	);
}
