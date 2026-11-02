import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, KanbanSquare, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { ActivityFormDialog } from "#/components/Tasks/ActivityFormDialog";
import {
	CalendarBoard,
	type CalendarItem,
	CalendarLegend,
	toCalendarItems,
} from "#/components/Tasks/CalendarBoard";
import { TaskFormDialog } from "#/components/Tasks/TaskFormDialog";
import { Button, buttonVariants } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	type CalendarActivity,
	createActivity,
	deleteActivity,
	listCalendar,
	updateActivity,
} from "#/lib/activities";
import {
	type DayKey,
	dayKeyLocal,
	parseDayKey,
	queryRange,
	step,
	visibleDays,
} from "#/lib/calendar";
import { roleCan } from "#/lib/permissions";
import {
	CALENDAR_VIEWS,
	type CalendarSearch,
	calendarSearchSchema,
} from "#/lib/schema";
import {
	createTask,
	deleteTask,
	getWorkspaceRefOptions,
	listTasks,
	type TaskCard,
	updateTask,
} from "#/lib/tasks";

// Protected by the _authed guard; listCalendar requires task:read and activity:read.
// The range is padded a day each side, so the server's time zone never hides
// items the browser places near midnight.
export const Route = createFileRoute("/_authed/calendar")({
	validateSearch: calendarSearchSchema,
	loaderDeps: ({ search }) => ({ view: search.view, date: search.date }),
	loader: async ({ deps }) => {
		const anchor = deps.date ? parseDayKey(deps.date) : new Date();
		const range = queryRange(visibleDays(deps.view, anchor));
		const [calendar, tasks, refs] = await Promise.all([
			listCalendar({ data: range }),
			listTasks({ data: {} }),
			getWorkspaceRefOptions(),
		]);
		return { calendar, tasks, refs };
	},
	component: CalendarPage,
});

const VIEW_LABELS = { day: "Day", week: "Week", month: "Month" } as const;

function rangeTitle(view: CalendarSearch["view"], days: Date[]) {
	if (view === "day") {
		return days[0].toLocaleDateString(undefined, {
			weekday: "long",
			month: "long",
			day: "numeric",
			year: "numeric",
		});
	}
	if (view === "week") {
		const first = days[0];
		const last = days[6];
		const sameMonth = first.getMonth() === last.getMonth();
		return `${first.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${last.toLocaleDateString(
			undefined,
			{
				month: sameMonth ? undefined : "short",
				day: "numeric",
				year: "numeric",
			},
		)}`;
	}
	// Month grids start in the previous month; the middle day is always in the month
	return days[15].toLocaleDateString(undefined, {
		month: "long",
		year: "numeric",
	});
}

function CalendarPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { calendar, tasks, refs } = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const role = access?.role;
	const can = {
		createTask: roleCan(role, { task: ["create"] }),
		updateTask: roleCan(role, { task: ["update"] }),
		deleteTask: roleCan(role, { task: ["delete"] }),
		createActivity: roleCan(role, { activity: ["create"] }),
		updateActivity: roleCan(role, { activity: ["update"] }),
		deleteActivity: roleCan(role, { activity: ["delete"] }),
	};

	// "Today" belongs to the browser's time zone, so resolve it after hydration
	const [today, setToday] = useState<DayKey | null>(null);
	useEffect(() => setToday(dayKeyLocal(new Date())), []);
	const anchorKey = search.date ?? today ?? dayKeyLocal(new Date());
	const anchor = parseDayKey(anchorKey);
	const days = useMemo(
		() => visibleDays(search.view, parseDayKey(anchorKey)),
		[search.view, anchorKey],
	);

	const items = useMemo(() => {
		const all = toCalendarItems(calendar.tasks, calendar.activities);
		return search.show === "all"
			? all
			: all.filter((i) =>
					search.show === "tasks" ? i.kind === "task" : i.kind === "activity",
				);
	}, [calendar, search.show]);

	const tasksById = useMemo(
		() => new Map(tasks.map((t) => [t.id, t])),
		[tasks],
	);
	const [taskDialog, setTaskDialog] = useState<{
		task: TaskCard | null;
		date?: string;
	} | null>(null);
	const [activityDialog, setActivityDialog] = useState<{
		activity: CalendarActivity | null;
		date?: string;
	} | null>(null);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);

	const go = (patch: Partial<CalendarSearch>) =>
		void navigate({ search: (prev) => ({ ...prev, ...patch }) });
	const done = async (message: string) => {
		setTaskDialog(null);
		setActivityDialog(null);
		setStatus({ ok: true, message });
		await router.invalidate();
	};

	const openItem = (item: CalendarItem) => {
		if (item.kind === "task") {
			const full = tasksById.get(item.id);
			if (full) setTaskDialog({ task: full });
		} else {
			setActivityDialog({ activity: item.activity });
		}
	};

	const canAddAnything = can.createTask || can.createActivity;

	return (
		<div className="space-y-5 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">Calendar</h1>
					<p className="text-sm text-muted-foreground">
						Tasks by due date and activities by start time.
					</p>
				</div>
				<div className="flex gap-2">
					<Link to="/tasks" className={buttonVariants({ variant: "outline" })}>
						<KanbanSquare /> Board
					</Link>
					{canAddAnything ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button type="button">
									<Plus /> New
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{can.createTask ? (
									<DropdownMenuItem
										onSelect={() =>
											setTaskDialog({ task: null, date: anchorKey })
										}
									>
										Task
									</DropdownMenuItem>
								) : null}
								{can.createActivity ? (
									<DropdownMenuItem
										onSelect={() =>
											setActivityDialog({ activity: null, date: anchorKey })
										}
									>
										Activity
									</DropdownMenuItem>
								) : null}
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
				</div>
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<div className="flex items-center gap-1">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => go({ date: undefined })}
					>
						Today
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={`Previous ${search.view}`}
						onClick={() =>
							go({ date: dayKeyLocal(step(search.view, anchor, -1)) })
						}
					>
						<ChevronLeft />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={`Next ${search.view}`}
						onClick={() =>
							go({ date: dayKeyLocal(step(search.view, anchor, 1)) })
						}
					>
						<ChevronRight />
					</Button>
				</div>
				<h2 className="text-lg font-semibold" aria-live="polite">
					{rangeTitle(search.view, days)}
				</h2>
				<div className="ml-auto flex flex-wrap items-center gap-2">
					<div
						className="flex rounded-lg bg-muted p-1"
						role="tablist"
						aria-label="Calendar view"
					>
						{CALENDAR_VIEWS.map((v) => (
							<button
								key={v}
								type="button"
								role="tab"
								aria-selected={search.view === v}
								onClick={() => go({ view: v })}
								className={`rounded-md px-3 py-1 text-sm font-medium ${
									search.view === v
										? "bg-background shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{VIEW_LABELS[v]}
							</button>
						))}
					</div>
					<div
						className="flex rounded-lg bg-muted p-1"
						role="tablist"
						aria-label="Show"
					>
						{(["all", "tasks", "activities"] as const).map((s) => (
							<button
								key={s}
								type="button"
								role="tab"
								aria-selected={search.show === s}
								onClick={() => go({ show: s })}
								className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${
									search.show === s
										? "bg-background shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{s}
							</button>
						))}
					</div>
				</div>
			</div>

			<CalendarLegend />

			<CalendarBoard
				view={search.view}
				days={days}
				anchorMonth={anchor.getMonth()}
				items={items}
				canAdd={canAddAnything}
				onOpen={openItem}
				onShowDay={(day) => go({ view: "day", date: day })}
				// "+" on a day adds a task when allowed; activities are in the New menu
				onAdd={(day) =>
					can.createTask
						? setTaskDialog({ task: null, date: day })
						: setActivityDialog({ activity: null, date: day })
				}
			/>

			<TaskFormDialog
				open={taskDialog !== null}
				onOpenChange={(o) => !o && setTaskDialog(null)}
				task={taskDialog?.task ?? null}
				draft={{ date: taskDialog?.date }}
				refs={refs}
				canEdit={taskDialog?.task ? can.updateTask : can.createTask}
				canDelete={can.deleteTask}
				onSave={async (value) => {
					if (taskDialog?.task)
						await updateTask({ data: { id: taskDialog.task.id, ...value } });
					else await createTask({ data: value });
					await done(taskDialog?.task ? "Task saved." : "Task created.");
				}}
				onDelete={
					taskDialog?.task
						? async () => {
								await deleteTask({
									data: { id: taskDialog.task?.id as string },
								});
								await done("Task deleted.");
							}
						: undefined
				}
			/>

			<ActivityFormDialog
				open={activityDialog !== null}
				onOpenChange={(o) => !o && setActivityDialog(null)}
				activity={activityDialog?.activity ?? null}
				date={activityDialog?.date}
				refs={refs}
				canEdit={
					activityDialog?.activity ? can.updateActivity : can.createActivity
				}
				canDelete={can.deleteActivity}
				onSave={async (value) => {
					if (activityDialog?.activity)
						await updateActivity({
							data: { id: activityDialog.activity.id, ...value },
						});
					else await createActivity({ data: value });
					await done(
						activityDialog?.activity ? "Activity saved." : "Activity logged.",
					);
				}}
				onDelete={
					activityDialog?.activity
						? async () => {
								await deleteActivity({
									data: { id: activityDialog.activity?.id as string },
								});
								await done("Activity deleted.");
							}
						: undefined
				}
			/>
		</div>
	);
}
