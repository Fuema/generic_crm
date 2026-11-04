import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, KanbanSquare, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { Button, buttonVariants } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { roleCan } from "#/lib/permissions";
import {
	getPreferences,
	setPreferences,
} from "#/modules/preferences/preferences";
import { CALENDAR_DAY_CHOICES } from "#/modules/preferences/schema";
import {
	type DayKey,
	dayKeyLocal,
	parseDayKey,
	queryRange,
	step,
	visibleDays,
} from "#/modules/tasks/calendar";
import { ActivityFormDialog } from "#/modules/tasks/components/ActivityFormDialog";
import {
	CalendarBoard,
	type CalendarItem,
	CalendarLegend,
	toCalendarItems,
} from "#/modules/tasks/components/CalendarBoard";
import { TaskFormDialog } from "#/modules/tasks/components/TaskFormDialog";
import {
	CALENDAR_VIEWS,
	type CalendarSearch,
	calendarSearchSchema,
} from "#/modules/tasks/schema";
import {
	type CalendarActivity,
	createActivity,
	createTask,
	deleteActivity,
	deleteTask,
	getWorkOptions,
	listCalendar,
	type TaskCard,
	updateActivity,
	updateTask,
} from "#/modules/tasks/tasks";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

// Protected by the _authed guard; listCalendar requires task:read and activity:read.
// The range is padded a day each side, so the server's time zone never hides
// items the browser places near midnight.
export const Route = createFileRoute("/_authed/calendar")({
	validateSearch: calendarSearchSchema,
	loaderDeps: ({ search }) => ({ view: search.view, date: search.date }),
	loader: async ({ deps }) => {
		const anchor = deps.date ? parseDayKey(deps.date) : new Date();
		const prefs = await getPreferences();
		const range = queryRange(
			visibleDays(deps.view, anchor, prefs.calendarDays),
		);
		const [calendar, options] = await Promise.all([
			listCalendar({ data: range }),
			getWorkOptions(),
		]);
		return { calendar, options, prefs };
	},
	component: CalendarPage,
});

const VIEW_LABELS = {
	day: () => m.calendar_view_day(),
	days: (count: number) => m.common_days_count({ count }),
	week: () => m.calendar_view_week(),
	month: () => m.calendar_view_month(),
} as const;

const SHOW_LABELS = {
	all: m.calendar_show_all,
	tasks: m.nav_tasks,
	activities: m.work_activities,
} as const;

function rangeTitle(view: CalendarSearch["view"], days: Date[]) {
	if (view === "day") {
		return days[0].toLocaleDateString(getLocale(), {
			weekday: "long",
			month: "long",
			day: "numeric",
			year: "numeric",
		});
	}
	if (view === "week" || view === "days") {
		const first = days[0];
		const last = days[days.length - 1];
		const sameMonth = first.getMonth() === last.getMonth();
		return `${first.toLocaleDateString(getLocale(), { month: "short", day: "numeric" })} – ${last.toLocaleDateString(
			getLocale(),
			{
				month: sameMonth ? undefined : "short",
				day: "numeric",
				year: "numeric",
			},
		)}`;
	}
	// Month grids start in the previous month; the middle day is always in the month
	return days[15].toLocaleDateString(getLocale(), {
		month: "long",
		year: "numeric",
	});
}

function CalendarPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { calendar, options, prefs } = Route.useLoaderData();
	const dayCount = prefs.calendarDays;
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
		() => visibleDays(search.view, parseDayKey(anchorKey), dayCount),
		[search.view, anchorKey, dayCount],
	);

	const items = useMemo(() => {
		const all = toCalendarItems(calendar.tasks, calendar.activities);
		return search.show === "all"
			? all
			: all.filter((i) =>
					search.show === "tasks" ? i.kind === "task" : i.kind === "activity",
				);
	}, [calendar, search.show]);

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
			setTaskDialog({ task: item.task });
		} else {
			setActivityDialog({ activity: item.activity });
		}
	};

	const canAddAnything = can.createTask || can.createActivity;

	return (
		<div className="space-y-5 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">{m.nav_calendar()}</h1>
					<p className="text-sm text-muted-foreground">
						{m.calendar_summary()}
					</p>
				</div>
				<div className="flex gap-2">
					<Link to="/tasks" className={buttonVariants({ variant: "outline" })}>
						<KanbanSquare /> {m.calendar_board()}
					</Link>
					{canAddAnything ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button type="button">
									<Plus /> {m.calendar_new()}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{can.createTask ? (
									<DropdownMenuItem
										onSelect={() =>
											setTaskDialog({ task: null, date: anchorKey })
										}
									>
										{m.calendar_task()}
									</DropdownMenuItem>
								) : null}
								{can.createActivity ? (
									<DropdownMenuItem
										onSelect={() =>
											setActivityDialog({ activity: null, date: anchorKey })
										}
									>
										{m.calendar_activity()}
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
						{m.work_today()}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={m.calendar_previous()}
						onClick={() =>
							go({ date: dayKeyLocal(step(search.view, anchor, -1, dayCount)) })
						}
					>
						<ChevronLeft />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={m.calendar_next()}
						onClick={() =>
							go({ date: dayKeyLocal(step(search.view, anchor, 1, dayCount)) })
						}
					>
						<ChevronRight />
					</Button>
				</div>
				<h2 className="text-lg font-semibold" aria-live="polite">
					{rangeTitle(search.view, days)}
				</h2>
				<div className="ml-auto flex flex-wrap items-center gap-2">
					{search.view === "days" ? (
						// The person's own choice, saved for every device
						<label className="flex items-center gap-2 text-sm">
							{m.calendar_days_label()}
							<select
								className="h-8 rounded-md border bg-background px-2"
								value={dayCount}
								onChange={async (e) => {
									await setPreferences({
										data: { calendarDays: Number(e.target.value) },
									});
									await router.invalidate();
								}}
							>
								{CALENDAR_DAY_CHOICES.map((n) => (
									<option key={n} value={n}>
										{n}
									</option>
								))}
							</select>
						</label>
					) : null}
					<div
						className="flex rounded-lg bg-muted p-1"
						role="tablist"
						aria-label={m.calendar_view_label()}
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
								{VIEW_LABELS[v](dayCount)}
							</button>
						))}
					</div>
					<div
						className="flex rounded-lg bg-muted p-1"
						role="tablist"
						aria-label={m.common_show()}
					>
						{(["all", "tasks", "activities"] as const).map((s) => (
							<button
								key={s}
								type="button"
								role="tab"
								aria-selected={search.show === s}
								onClick={() => go({ show: s })}
								className={`rounded-md px-3 py-1 text-sm font-medium ${
									search.show === s
										? "bg-background shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{SHOW_LABELS[s]()}
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
				options={options}
				canEdit={taskDialog?.task ? can.updateTask : can.createTask}
				canDelete={can.deleteTask}
				onSave={async (value) => {
					if (taskDialog?.task)
						await updateTask({ data: { id: taskDialog.task.id, ...value } });
					else await createTask({ data: value });
					await done(taskDialog?.task ? m.task_saved() : m.task_created());
				}}
				onDelete={
					taskDialog?.task
						? async () => {
								await deleteTask({
									data: { id: taskDialog.task?.id as string },
								});
								await done(m.task_deleted());
							}
						: undefined
				}
			/>

			<ActivityFormDialog
				open={activityDialog !== null}
				onOpenChange={(o) => !o && setActivityDialog(null)}
				activity={activityDialog?.activity ?? null}
				draft={{ date: activityDialog?.date }}
				options={options}
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
						activityDialog?.activity
							? m.activity_saved()
							: m.activity_created(),
					);
				}}
				onDelete={
					activityDialog?.activity
						? async () => {
								await deleteActivity({
									data: { id: activityDialog.activity?.id as string },
								});
								await done(m.activity_deleted());
							}
						: undefined
				}
			/>
		</div>
	);
}
