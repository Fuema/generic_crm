import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CalendarDays, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { FilterSelect, SearchBox } from "#/components/data/ListControls";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button, buttonVariants } from "#/components/ui/button";
import { roleCan } from "#/lib/permissions";
import {
	getPreferences,
	setPreferences,
} from "#/modules/preferences/preferences";
import { TASK_DUE_CHOICES } from "#/modules/preferences/schema";
import { TaskBoard } from "#/modules/tasks/components/TaskBoard";
import {
	type TaskDraft,
	TaskFormDialog,
} from "#/modules/tasks/components/TaskFormDialog";
import {
	TASK_PRIORITIES,
	TASK_PRIORITY_LABELS,
	type TaskBoardSearch,
	type TaskStatus,
	taskBoardSearchSchema,
} from "#/modules/tasks/schema";
import {
	createTask,
	deleteTask,
	getWorkOptions,
	listTasks,
	moveTask,
	type TaskCard,
	updateTask,
} from "#/modules/tasks/tasks";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed guard; listTasks requires task:read
export const Route = createFileRoute("/_authed/tasks")({
	validateSearch: taskBoardSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [prefs, options] = await Promise.all([
			getPreferences(),
			getWorkOptions(),
		]);
		const tasks = await listTasks({
			data: { ...deps, dueWithin: prefs.taskDueDays },
		});
		return { tasks, options, prefs };
	},
	component: TasksPage,
});

function TasksPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { tasks, options, prefs } = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const can = {
		create: roleCan(access?.role, { task: ["create"] }),
		update: roleCan(access?.role, { task: ["update"] }),
		delete: roleCan(access?.role, { task: ["delete"] }),
	};
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState<TaskCard | null>(null);
	const [draft, setDraft] = useState<TaskDraft | undefined>();
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);

	const patch = useCallback(
		(p: Partial<TaskBoardSearch>) =>
			void navigate({ search: (prev) => ({ ...prev, ...p }) }),
		[navigate],
	);

	const openNew = (taskStatus: TaskStatus = "todo") => {
		setEditing(null);
		setDraft({ status: taskStatus, projectId: search.project });
		setOpen(true);
	};

	const assigneeOptions = [
		{ value: "me", label: m.tasks_mine() },
		...options.members
			.filter((p) => p.id !== options.currentUserId)
			.map((p) => ({ value: p.id, label: p.name })),
	];

	return (
		<div className="space-y-5 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">{m.nav_tasks()}</h1>
					<p className="text-sm text-muted-foreground">
						{can.update ? m.tasks_drag_hint() : m.common_view_only()}
					</p>
				</div>
				<div className="flex gap-2">
					<Link
						to="/calendar"
						className={buttonVariants({ variant: "outline" })}
					>
						<CalendarDays /> {m.nav_calendar()}
					</Link>
					{can.create ? (
						<Button type="button" onClick={() => openNew()}>
							<Plus /> {m.task_new_title()}
						</Button>
					) : null}
				</div>
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			<div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
				<SearchBox
					id="task-search"
					value={search.q}
					placeholder={m.tasks_search_placeholder()}
					onSearch={(q) => patch({ q })}
				/>
				<FilterSelect
					id="task-assignee-filter"
					label={m.task_assignee()}
					value={search.assignee}
					allLabel={m.tasks_everyone()}
					options={assigneeOptions}
					onChange={(v) => patch({ assignee: v })}
				/>
				<FilterSelect
					id="task-priority-filter"
					label={m.task_priority()}
					value={search.priority}
					allLabel={m.tasks_all_priorities()}
					options={TASK_PRIORITIES.map((p) => ({
						value: p,
						label: TASK_PRIORITY_LABELS[p](),
					}))}
					onChange={(v) =>
						patch({ priority: v as TaskBoardSearch["priority"] })
					}
				/>
				<FilterSelect
					id="task-project-filter"
					label={m.work_project()}
					value={search.project}
					allLabel={m.tasks_all_projects()}
					options={options.projects.map((p) => ({
						value: p.id,
						label: p.name,
					}))}
					onChange={(v) => patch({ project: v })}
				/>
				<FilterSelect
					id="task-due-filter"
					label={m.tasks_due_within()}
					value={prefs.taskDueDays ? String(prefs.taskDueDays) : undefined}
					allLabel={m.tasks_due_all()}
					options={TASK_DUE_CHOICES.map((n) => ({
						value: String(n),
						label: m.common_days_count({ count: n }),
					}))}
					// The person's own choice, saved for every device
					onChange={async (v) => {
						await setPreferences({
							data: { taskDueDays: v ? Number(v) : null },
						});
						await router.invalidate();
					}}
				/>
			</div>

			<TaskBoard
				tasks={tasks}
				canMove={can.update}
				canCreate={can.create}
				onAdd={openNew}
				onOpen={(task) => {
					setEditing(task);
					setDraft(undefined);
					setOpen(true);
				}}
				onMove={async (move) => {
					setStatus(null);
					try {
						await moveTask({ data: move });
						await router.invalidate();
					} catch (e) {
						setStatus({ ok: false, message: await serverErrorMessage(e) });
						throw e;
					}
				}}
			/>

			<TaskFormDialog
				open={open}
				onOpenChange={setOpen}
				task={editing}
				draft={draft}
				options={options}
				canEdit={editing ? can.update : can.create}
				canDelete={can.delete}
				onSave={async (value) => {
					if (editing) {
						await updateTask({ data: { id: editing.id, ...value } });
						setStatus({ ok: true, message: m.task_saved() });
					} else {
						await createTask({ data: value });
						setStatus({ ok: true, message: m.task_created() });
					}
					setOpen(false);
					await router.invalidate();
				}}
				onDelete={
					editing
						? async () => {
								await deleteTask({ data: { id: editing.id } });
								setOpen(false);
								setStatus({ ok: true, message: m.task_deleted() });
								await router.invalidate();
							}
						: undefined
				}
			/>
		</div>
	);
}
