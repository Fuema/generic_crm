import {
	type Announcements,
	closestCorners,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, Link2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { dayKeyLocal, formatTime, itemDayKey } from "#/lib/calendar";
import { orderNumberLabel } from "#/lib/money";
import { TASK_STATUSES, type TaskStatus } from "#/lib/schema";
import type { TaskCard } from "#/lib/tasks";
import { initials, PriorityBadge, STATUS_LABELS } from "./fields";

type Columns = Record<TaskStatus, string[]>;

function toColumns(tasks: TaskCard[]): Columns {
	const columns = Object.fromEntries(
		TASK_STATUSES.map((s) => [s, [] as string[]]),
	) as Columns;
	for (const t of [...tasks].sort((a, b) => a.position - b.position)) {
		(columns[t.status as TaskStatus] ?? columns.todo).push(t.id);
	}
	return columns;
}

function dueLabel(t: TaskCard) {
	if (!t.dueAt) return null;
	const key = itemDayKey(t.dueAt, t.allDay);
	const today = dayKeyLocal(new Date());
	const [y, m, d] = key.split("-").map(Number);
	const date = new Date(y, m - 1, d).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
	const overdue = t.status !== "done" && key < today;
	return {
		text: `${key === today ? "Today" : date}${t.allDay ? "" : ` ${formatTime(t.dueAt)}`}`,
		overdue,
	};
}

function CardBody({ task }: { task: TaskCard }) {
	const due = dueLabel(task);
	return (
		<div className="space-y-2">
			<div className="flex items-start justify-between gap-2">
				<p
					className={`text-sm font-medium break-words ${task.status === "done" ? "text-muted-foreground line-through" : ""}`}
				>
					{task.title}
				</p>
				<PriorityBadge priority={task.priority} />
			</div>
			{task.customerName || task.orderNumber ? (
				<p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
					<Link2 className="size-3 shrink-0" aria-hidden="true" />
					{[
						task.customerName,
						task.orderNumber ? orderNumberLabel(task.orderNumber) : null,
					]
						.filter(Boolean)
						.join(" · ")}
				</p>
			) : null}
			<div className="flex items-center justify-between gap-2 text-xs">
				{due ? (
					<span
						className={`inline-flex items-center gap-1 ${due.overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}
					>
						<CalendarClock className="size-3" aria-hidden="true" />
						{due.overdue ? "Overdue · " : ""}
						{due.text}
					</span>
				) : (
					<span />
				)}
				{task.assigneeName ? (
					<span
						className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold"
						title={task.assigneeName}
					>
						<span aria-hidden="true">{initials(task.assigneeName)}</span>
						<span className="sr-only">Assigned to {task.assigneeName}</span>
					</span>
				) : null}
			</div>
		</div>
	);
}

function SortableCard({
	task,
	disabled,
	onOpen,
}: {
	task: TaskCard;
	disabled: boolean;
	onOpen: () => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: task.id,
		disabled,
	});
	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={`rounded-lg border bg-card p-3 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${
				disabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
			} ${isDragging ? "opacity-40" : ""}`}
			{...attributes}
			{...listeners}
			aria-roledescription={disabled ? undefined : "draggable task"}
			aria-label={`${task.title}. ${STATUS_LABELS[task.status as TaskStatus] ?? task.status}. Press Enter to open${disabled ? "" : ", Space to pick up"}.`}
			onClick={onOpen}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					onOpen();
					return;
				}
				listeners?.onKeyDown?.(e);
			}}
		>
			<CardBody task={task} />
		</li>
	);
}

function Column({
	status,
	ids,
	byId,
	canMove,
	canCreate,
	onOpen,
	onAdd,
}: {
	status: TaskStatus;
	ids: string[];
	byId: Map<string, TaskCard>;
	canMove: boolean;
	canCreate: boolean;
	onOpen: (task: TaskCard) => void;
	onAdd: (status: TaskStatus) => void;
}) {
	// The column itself is a drop target, so empty columns accept cards
	const { setNodeRef, isOver } = useDroppable({ id: status });
	return (
		<section
			aria-label={`${STATUS_LABELS[status]} column`}
			className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/50 ${isOver ? "ring-2 ring-ring" : ""}`}
		>
			<header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
				<h2 className="text-sm font-semibold">
					{STATUS_LABELS[status]}{" "}
					<span className="font-normal text-muted-foreground">
						{ids.length}
					</span>
				</h2>
				{canCreate ? (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => onAdd(status)}
						aria-label={`Add task to ${STATUS_LABELS[status]}`}
					>
						<Plus />
					</Button>
				) : null}
			</header>
			<SortableContext
				id={status}
				items={ids}
				strategy={verticalListSortingStrategy}
			>
				<ul
					ref={setNodeRef}
					className="flex min-h-24 flex-1 flex-col gap-2 px-3 pb-3"
				>
					{ids.map((id) => {
						const task = byId.get(id);
						return task ? (
							<SortableCard
								key={id}
								task={task}
								disabled={!canMove}
								onOpen={() => onOpen(task)}
							/>
						) : null;
					})}
					{ids.length === 0 ? (
						<li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
							{canMove ? "Drop tasks here" : "No tasks"}
						</li>
					) : null}
				</ul>
			</SortableContext>
		</section>
	);
}

export function TaskBoard({
	tasks,
	canMove,
	canCreate,
	onOpen,
	onAdd,
	onMove,
}: {
	tasks: TaskCard[];
	canMove: boolean;
	canCreate: boolean;
	onOpen: (task: TaskCard) => void;
	onAdd: (status: TaskStatus) => void;
	// Persists a drop; must throw on failure so the board can snap back
	onMove: (move: {
		id: string;
		status: TaskStatus;
		beforeId: string | null;
		afterId: string | null;
	}) => Promise<void>;
}) {
	const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
	const [columns, setColumns] = useState<Columns>(() => toColumns(tasks));
	const [activeId, setActiveId] = useState<string | null>(null);

	// Server data is the source of truth whenever it changes
	useEffect(() => setColumns(toColumns(tasks)), [tasks]);

	const sensors = useSensors(
		// A small move threshold keeps clicks (open the task) separate from drags
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const columnOf = (id: string, cols = columns): TaskStatus | null => {
		if ((TASK_STATUSES as readonly string[]).includes(id))
			return id as TaskStatus;
		return TASK_STATUSES.find((s) => cols[s].includes(id)) ?? null;
	};

	const onDragStart = ({ active }: DragStartEvent) =>
		setActiveId(String(active.id));

	// Moving across columns updates the preview while dragging
	const onDragOver = ({ active, over }: DragOverEvent) => {
		if (!over) return;
		const from = columnOf(String(active.id));
		const to = columnOf(String(over.id));
		if (!from || !to || from === to) return;
		setColumns((cols) => {
			const fromIds = cols[from].filter((id) => id !== active.id);
			const toIds = [...cols[to]];
			const overIndex = toIds.indexOf(String(over.id));
			toIds.splice(
				overIndex >= 0 ? overIndex : toIds.length,
				0,
				String(active.id),
			);
			return { ...cols, [from]: fromIds, [to]: toIds };
		});
	};

	const onDragEnd = async ({ active, over }: DragEndEvent) => {
		setActiveId(null);
		const id = String(active.id);
		const original = toColumns(tasks);
		if (!over) {
			setColumns(original);
			return;
		}
		const status = columnOf(id);
		if (!status) return;
		let ids = columns[status];
		const overId = String(over.id);
		if (ids.includes(overId) && overId !== id) {
			ids = arrayMove(ids, ids.indexOf(id), ids.indexOf(overId));
		}
		const next = { ...columns, [status]: ids };
		setColumns(next);

		const index = ids.indexOf(id);
		const unchanged =
			columnOf(id, original) === status &&
			original[status].indexOf(id) === index;
		if (unchanged) return;
		try {
			await onMove({
				id,
				status,
				beforeId: ids[index - 1] ?? null,
				afterId: ids[index + 1] ?? null,
			});
		} catch {
			// The caller shows the error; put the card back where the server has it
			setColumns(original);
		}
	};

	const title = (id: string | number | undefined) =>
		id ? (byId.get(String(id))?.title ?? "task") : "task";
	const place = (id: string | number | undefined) => {
		const s = id ? columnOf(String(id)) : null;
		return s ? STATUS_LABELS[s] : "the board";
	};
	const announcements: Announcements = {
		onDragStart: ({ active }) => `Picked up ${title(active.id)}.`,
		onDragOver: ({ active, over }) =>
			over ? `${title(active.id)} is over ${place(over.id)}.` : undefined,
		onDragEnd: ({ active, over }) =>
			over
				? `${title(active.id)} was dropped in ${place(over.id)}.`
				: `${title(active.id)} was dropped.`,
		onDragCancel: ({ active }) => `Moving ${title(active.id)} was cancelled.`,
	};

	const activeTask = activeId ? byId.get(activeId) : null;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCorners}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDragEnd={onDragEnd}
			onDragCancel={() => {
				setActiveId(null);
				setColumns(toColumns(tasks));
			}}
			accessibility={{
				announcements,
				screenReaderInstructions: {
					draggable:
						"To move a task, press Space to pick it up, use the arrow keys to move it, then press Space again to drop it, or Escape to cancel.",
				},
			}}
		>
			<div className="flex gap-4 overflow-x-auto pb-4">
				{TASK_STATUSES.map((status) => (
					<Column
						key={status}
						status={status}
						ids={columns[status]}
						byId={byId}
						canMove={canMove}
						canCreate={canCreate}
						onOpen={onOpen}
						onAdd={onAdd}
					/>
				))}
			</div>
			<DragOverlay>
				{activeTask ? (
					<div className="w-66 rotate-2 rounded-lg border bg-card p-3 shadow-lg">
						<CardBody task={activeTask} />
					</div>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}
