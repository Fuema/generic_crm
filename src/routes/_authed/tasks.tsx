import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { CalendarDays, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/Customers/CustomerFormDialog";
import { FilterSelect, SearchBox } from "#/components/data/ListControls";
import { PRIORITY_LABELS } from "#/components/Tasks/fields";
import { TaskBoard } from "#/components/Tasks/TaskBoard";
import {
	type TaskDraft,
	TaskFormDialog,
} from "#/components/Tasks/TaskFormDialog";
import { Button, buttonVariants } from "#/components/ui/button";
import { roleCan } from "#/lib/permissions";
import {
	TASK_PRIORITIES,
	type TaskBoardSearch,
	type TaskStatus,
	taskBoardSearchSchema,
} from "#/lib/schema";
import {
	createTask,
	deleteTask,
	getWorkspaceRefOptions,
	listTasks,
	moveTask,
	type TaskCard,
	updateTask,
} from "#/lib/tasks";
import {
	getPreferences,
	setPreferences,
} from "#/modules/preferences/preferences";
import { TASK_DUE_CHOICES } from "#/modules/preferences/schema";
import { m } from "#/paraglide/messages.js";

// Protected by the _authed guard; listTasks requires task:read
export const Route = createFileRoute("/_authed/tasks")({
	validateSearch: taskBoardSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const prefs = await getPreferences();
		const [tasks, refs] = await Promise.all([
			listTasks({ data: { ...deps, dueWithin: prefs.taskDueDays } }),
			getWorkspaceRefOptions(),
		]);
		return { tasks, refs, prefs };
	},
	component: TasksPage,
});

function TasksPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { tasks, refs, prefs } = Route.useLoaderData();
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
		setDraft({ status: taskStatus });
		setOpen(true);
	};

	const assigneeOptions = [
		{ value: "me", label: "My tasks" },
		...refs.members
			.filter((m) => m.id !== refs.currentUserId)
			.map((m) => ({ value: m.id, label: m.name })),
	];

	return (
		<div className="space-y-5 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">Tasks</h1>
					<p className="text-sm text-muted-foreground">
						{can.update
							? "Drag cards between columns to change their status."
							: "View-only access."}
					</p>
				</div>
				<div className="flex gap-2">
					<Link
						to="/calendar"
						className={buttonVariants({ variant: "outline" })}
					>
						<CalendarDays /> Calendar
					</Link>
					{can.create ? (
						<Button type="button" onClick={() => openNew()}>
							<Plus /> New task
						</Button>
					) : null}
				</div>
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			<div className="flex flex-col gap-3 md:flex-row md:items-end">
				<SearchBox
					id="task-search"
					value={search.q}
					placeholder="Search task titles"
					onSearch={(q) => patch({ q })}
				/>
				<FilterSelect
					id="task-assignee-filter"
					label="Assignee"
					value={search.assignee}
					allLabel="Everyone"
					options={assigneeOptions}
					onChange={(v) => patch({ assignee: v })}
				/>
				<FilterSelect
					id="task-priority-filter"
					label="Priority"
					value={search.priority}
					allLabel="All priorities"
					options={TASK_PRIORITIES.map((p) => ({
						value: p,
						label: PRIORITY_LABELS[p],
					}))}
					onChange={(v) =>
						patch({ priority: v as TaskBoardSearch["priority"] })
					}
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
				refs={refs}
				canEdit={editing ? can.update : can.create}
				canDelete={can.delete}
				onSave={async (value) => {
					if (editing) {
						await updateTask({ data: { id: editing.id, ...value } });
						setStatus({ ok: true, message: "Task saved." });
					} else {
						await createTask({ data: value });
						setStatus({ ok: true, message: "Task created." });
					}
					setOpen(false);
					await router.invalidate();
				}}
				onDelete={
					editing
						? async () => {
								await deleteTask({ data: { id: editing.id } });
								setOpen(false);
								setStatus({ ok: true, message: "Task deleted." });
								await router.invalidate();
							}
						: undefined
				}
			/>
		</div>
	);
}
