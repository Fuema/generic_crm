import { BellRing, CheckSquare, Mail, Phone, Plus, Users } from "lucide-react";
import type { CalendarActivity, CalendarTask } from "#/lib/activities";
import {
	type DayKey,
	dayKeyLocal,
	formatTime,
	itemDayKey,
} from "#/lib/calendar";
import type { ActivityType, CalendarView } from "#/lib/schema";
import { ACTIVITY_LABELS } from "./ActivityFormDialog";

// One entry on the calendar: a task (by due date) or an activity (by start)
export type CalendarItem =
	| {
			kind: "task";
			id: string;
			title: string;
			at: Date;
			allDay: boolean;
			done: boolean;
			meta: string;
			task: CalendarTask;
	  }
	| {
			kind: "activity";
			id: string;
			title: string;
			at: Date;
			end: Date | null;
			allDay: boolean;
			done: boolean;
			meta: string;
			activity: CalendarActivity;
	  };

const ACTIVITY_ICONS: Record<ActivityType, typeof Phone> = {
	call: Phone,
	meeting: Users,
	email: Mail,
	follow_up: BellRing,
};

export function toCalendarItems(
	tasks: CalendarTask[],
	activities: CalendarActivity[],
) {
	const items: CalendarItem[] = [
		...tasks
			.filter((t) => t.dueAt)
			.map(
				(t): CalendarItem => ({
					kind: "task",
					id: t.id,
					title: t.title,
					at: new Date(t.dueAt as Date),
					allDay: t.allDay,
					done: t.status === "done",
					meta: [t.assigneeName, t.customerName].filter(Boolean).join(" · "),
					task: t,
				}),
			),
		...activities.map(
			(a): CalendarItem => ({
				kind: "activity",
				id: a.id,
				title: a.subject,
				at: new Date(a.startsAt),
				end: a.endsAt ? new Date(a.endsAt) : null,
				allDay: a.allDay,
				done: a.completed,
				meta: [
					ACTIVITY_LABELS[a.type as ActivityType] ?? a.type,
					a.customerName,
					a.ownerName,
				]
					.filter(Boolean)
					.join(" · "),
				activity: a,
			}),
		),
	];
	// All-day first, then by time
	return items.sort(
		(x, y) =>
			Number(y.allDay) - Number(x.allDay) || x.at.getTime() - y.at.getTime(),
	);
}

export function groupByDay(items: CalendarItem[]) {
	const map = new Map<DayKey, CalendarItem[]>();
	for (const item of items) {
		const key = itemDayKey(item.at, item.allDay);
		map.set(key, [...(map.get(key) ?? []), item]);
	}
	return map;
}

function ItemIcon({ item }: { item: CalendarItem }) {
	const Icon =
		item.kind === "task"
			? CheckSquare
			: (ACTIVITY_ICONS[item.activity.type as ActivityType] ?? BellRing);
	return <Icon className="size-3.5 shrink-0" aria-hidden="true" />;
}

function itemLabel(item: CalendarItem) {
	const kind =
		item.kind === "task"
			? "Task"
			: (ACTIVITY_LABELS[item.activity.type as ActivityType] ?? "Activity");
	const when = item.allDay ? "all day" : formatTime(item.at);
	return `${kind}: ${item.title}, ${when}${item.done ? ", done" : ""}`;
}

// Compact chip for month and week cells
function Chip({
	item,
	onOpen,
}: {
	item: CalendarItem;
	onOpen: (item: CalendarItem) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onOpen(item)}
			aria-label={itemLabel(item)}
			className={`flex w-full items-center gap-1.5 rounded-md border-l-[3px] bg-background px-1.5 py-0.5 text-left text-xs hover:bg-accent ${
				item.done ? "text-muted-foreground line-through" : ""
			}`}
			style={{
				borderLeftColor: item.kind === "task" ? "var(--viz-1)" : "var(--viz-2)",
			}}
		>
			<ItemIcon item={item} />
			{item.allDay ? null : (
				<span className="shrink-0 tabular-nums text-muted-foreground">
					{formatTime(item.at)}
				</span>
			)}
			<span className="truncate">{item.title}</span>
		</button>
	);
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarBoard({
	view,
	days,
	anchorMonth,
	items,
	canAdd,
	onOpen,
	onAdd,
	onShowDay,
}: {
	view: CalendarView;
	days: Date[];
	anchorMonth: number;
	items: CalendarItem[];
	canAdd: boolean;
	onOpen: (item: CalendarItem) => void;
	onAdd: (day: DayKey) => void;
	onShowDay: (day: DayKey) => void;
}) {
	const byDay = groupByDay(items);
	const today = dayKeyLocal(new Date());

	if (view === "day") {
		const key = dayKeyLocal(days[0]);
		const list = byDay.get(key) ?? [];
		const allDay = list.filter((i) => i.allDay);
		const timed = list.filter((i) => !i.allDay);
		return (
			<div className="space-y-4 rounded-xl border bg-background p-4">
				{list.length === 0 ? (
					<div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
						<p>Nothing planned for this day.</p>
						{canAdd ? (
							<button
								type="button"
								className="text-foreground underline-offset-4 hover:underline"
								onClick={() => onAdd(key)}
							>
								Add something
							</button>
						) : null}
					</div>
				) : null}
				{allDay.length ? (
					<section aria-label="All day" className="space-y-2">
						<h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							All day
						</h3>
						<ul className="space-y-1.5">
							{allDay.map((item) => (
								<li key={item.id}>
									<AgendaRow item={item} onOpen={onOpen} />
								</li>
							))}
						</ul>
					</section>
				) : null}
				{timed.length ? (
					<section aria-label="Scheduled" className="space-y-2">
						<h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							Scheduled
						</h3>
						<ul className="space-y-1.5">
							{timed.map((item) => (
								<li key={item.id}>
									<AgendaRow item={item} onOpen={onOpen} />
								</li>
							))}
						</ul>
					</section>
				) : null}
			</div>
		);
	}

	if (view === "week") {
		return (
			<div className="grid gap-2 md:grid-cols-7">
				{days.map((d) => {
					const key = dayKeyLocal(d);
					const list = byDay.get(key) ?? [];
					return (
						<section
							key={key}
							aria-label={d.toLocaleDateString(undefined, {
								weekday: "long",
								month: "long",
								day: "numeric",
							})}
							className={`flex min-h-40 flex-col rounded-xl border bg-background p-2 ${key === today ? "ring-2 ring-ring" : ""}`}
						>
							<header className="mb-2 flex items-center justify-between">
								<button
									type="button"
									onClick={() => onShowDay(key)}
									className="text-left text-sm hover:underline"
									aria-label={`Open ${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
								>
									<span className="text-muted-foreground">
										{WEEKDAYS[(d.getDay() + 6) % 7]}
									</span>{" "}
									<span className="font-semibold">{d.getDate()}</span>
								</button>
								{canAdd ? <AddButton day={key} onAdd={onAdd} /> : null}
							</header>
							<ul className="flex flex-col gap-1">
								{list.map((item) => (
									<li key={item.id}>
										<Chip item={item} onOpen={onOpen} />
									</li>
								))}
							</ul>
						</section>
					);
				})}
			</div>
		);
	}

	// Month: 6 weeks, Monday first
	return (
		<div className="overflow-hidden rounded-xl border bg-background">
			<div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
				{WEEKDAYS.map((w) => (
					<div key={w} className="py-2">
						{w}
					</div>
				))}
			</div>
			<div className="grid grid-cols-7">
				{days.map((d) => {
					const key = dayKeyLocal(d);
					const list = byDay.get(key) ?? [];
					const inMonth = d.getMonth() === anchorMonth;
					return (
						<section
							key={key}
							aria-label={d.toLocaleDateString(undefined, {
								weekday: "long",
								month: "long",
								day: "numeric",
							})}
							className={`group min-h-28 border-r border-b p-1.5 [&:nth-child(7n)]:border-r-0 ${inMonth ? "" : "bg-muted/40"}`}
						>
							<div className="mb-1 flex items-center justify-between">
								<button
									type="button"
									onClick={() => onShowDay(key)}
									className={`flex size-6 items-center justify-center rounded-full text-xs hover:bg-accent ${
										key === today
											? "bg-primary font-semibold text-primary-foreground hover:bg-primary"
											: inMonth
												? ""
												: "text-muted-foreground"
									}`}
									aria-label={`Open ${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
								>
									{d.getDate()}
								</button>
								{canAdd ? (
									<span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
										<AddButton day={key} onAdd={onAdd} />
									</span>
								) : null}
							</div>
							<ul className="flex flex-col gap-0.5">
								{list.slice(0, 3).map((item) => (
									<li key={item.id}>
										<Chip item={item} onOpen={onOpen} />
									</li>
								))}
							</ul>
							{list.length > 3 ? (
								<button
									type="button"
									onClick={() => onShowDay(key)}
									className="mt-0.5 px-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
								>
									+{list.length - 3} more
								</button>
							) : null}
						</section>
					);
				})}
			</div>
		</div>
	);
}

function AddButton({
	day,
	onAdd,
}: {
	day: DayKey;
	onAdd: (day: DayKey) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onAdd(day)}
			className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
			aria-label={`Add to ${day}`}
		>
			<Plus className="size-3.5" />
		</button>
	);
}

function AgendaRow({
	item,
	onOpen,
}: {
	item: CalendarItem;
	onOpen: (item: CalendarItem) => void;
}) {
	const time = item.allDay
		? "All day"
		: item.kind === "activity" && item.end
			? `${formatTime(item.at)} – ${formatTime(item.end)}`
			: formatTime(item.at);
	return (
		<button
			type="button"
			onClick={() => onOpen(item)}
			aria-label={itemLabel(item)}
			className="flex w-full items-start gap-3 rounded-lg border border-l-4 bg-background p-3 text-left hover:bg-accent"
			style={{
				borderLeftColor: item.kind === "task" ? "var(--viz-1)" : "var(--viz-2)",
			}}
		>
			<span className="w-28 shrink-0 text-sm tabular-nums text-muted-foreground">
				{time}
			</span>
			<span className="min-w-0 flex-1">
				<span
					className={`flex items-center gap-1.5 font-medium ${item.done ? "text-muted-foreground line-through" : ""}`}
				>
					<ItemIcon item={item} />
					<span className="truncate">{item.title}</span>
				</span>
				{item.meta ? (
					<span className="block truncate text-sm text-muted-foreground">
						{item.meta}
					</span>
				) : null}
			</span>
			<span className="shrink-0 text-xs text-muted-foreground">
				{item.kind === "task" ? "Task" : "Activity"}
			</span>
		</button>
	);
}

export function CalendarLegend() {
	return (
		<ul
			className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
			aria-label="Legend"
		>
			<li className="flex items-center gap-1.5">
				<span
					className="h-3 w-1 rounded-full"
					style={{ background: "var(--viz-1)" }}
					aria-hidden="true"
				/>
				<CheckSquare className="size-3.5" aria-hidden="true" /> Task
			</li>
			<li className="flex items-center gap-1.5">
				<span
					className="h-3 w-1 rounded-full"
					style={{ background: "var(--viz-2)" }}
					aria-hidden="true"
				/>
				Activity:
				<Phone className="size-3.5" aria-hidden="true" /> call
				<Users className="size-3.5" aria-hidden="true" /> meeting
				<Mail className="size-3.5" aria-hidden="true" /> email
				<BellRing className="size-3.5" aria-hidden="true" /> follow-up
			</li>
		</ul>
	);
}
