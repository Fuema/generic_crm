import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
	Archive,
	ArchiveRestore,
	ArrowDown,
	ArrowUp,
	FolderPlus,
	Lock,
	Pencil,
	Plus,
} from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import { Label } from "#/components/ui/label";
import { roleCan } from "#/lib/permissions";
import {
	FieldDialog,
	GroupDialog,
	TYPE_LABELS,
} from "#/modules/fields/components/FieldDialogs";
import {
	type FieldSettings,
	getFieldSettings,
	reorderFields,
	setFieldArchived,
	setGroupArchived,
} from "#/modules/fields/fields";
import {
	type FieldDef,
	type FieldType,
	localized,
	OBJECT_KEYS,
	type ObjectKey,
} from "#/modules/fields/schema";
import {
	applyGenericTemplate,
	getTemplateStatus,
} from "#/modules/templates/templates";
import { m } from "#/paraglide/messages.js";

// Settings → Fields. Everyone can see the definitions; owners and admins change
// them (every server function checks the field permission again).
export const Route = createFileRoute("/_authed/settings/fields")({
	validateSearch: z.object({
		object: z.enum(OBJECT_KEYS).catch("contact").default("contact"),
		archived: z.boolean().catch(false).default(false),
	}),
	loaderDeps: ({ search }) => ({ object: search.object }),
	loader: async ({ deps }) => {
		const [settings, template] = await Promise.all([
			getFieldSettings({ data: { objectKey: deps.object } }),
			getTemplateStatus(),
		]);
		return { ...settings, template };
	},
	component: FieldsPage,
});

type Group = FieldSettings["groups"][number];
type Status = { ok: boolean; message: string } | null;

function FieldsPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const { object, archived: showArchived } = Route.useSearch();
	const { groups, fields, template } = Route.useLoaderData();
	const [applying, setApplying] = useState(false);
	const templateMissing =
		template.fieldsMissing + template.viewsMissing + template.pipelinesMissing;
	const { access } = Route.useRouteContext();
	const canManage = roleCan(access?.role, { field: ["update"] });
	const [status, setStatus] = useState<Status>(null);
	const [fieldDialog, setFieldDialog] = useState<{
		field: FieldDef | null;
	} | null>(null);
	const [groupDialog, setGroupDialog] = useState<{
		group: Group | null;
	} | null>(null);

	const activeGroups = groups.filter((g) => !g.archivedAt);
	const visibleFields = fields.filter((f) => showArchived || !f.archivedAt);
	const visibleGroups = groups.filter((g) => showArchived || !g.archivedAt);

	const run = async (action: () => Promise<unknown>, message?: string) => {
		setStatus(null);
		try {
			await action();
			if (message) setStatus({ ok: true, message });
			await router.invalidate();
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	// Swap two neighbours in the overall order and save every position
	const move = (
		table: "field" | "group",
		list: { id: string }[],
		id: string,
		delta: -1 | 1,
	) => {
		const ordered = (table === "field" ? fields : groups).map((x) => x.id);
		const index = list.findIndex((x) => x.id === id);
		const other = list[index + delta];
		if (!other) return;
		const a = ordered.indexOf(id);
		const b = ordered.indexOf(other.id);
		[ordered[a], ordered[b]] = [ordered[b], ordered[a]];
		void run(() =>
			reorderFields({ data: { table, objectKey: object, ids: ordered } }),
		);
	};

	const sections = [
		...visibleGroups.map((g) => ({
			group: g as Group | null,
			fields: visibleFields.filter((f) => f.groupId === g.id),
		})),
		{
			group: null,
			fields: visibleFields.filter(
				(f) => !f.groupId || !groups.some((g) => g.id === f.groupId),
			),
		},
	];

	const fieldRow = (f: FieldDef, siblings: FieldDef[]) => {
		const name = localized(f.label);
		const i = siblings.indexOf(f);
		return (
			<li key={f.id} className="flex flex-wrap items-center gap-3 py-2">
				<div className="min-w-0 flex-1">
					<p className="font-medium">{name}</p>
					<p className="text-xs text-muted-foreground">
						{TYPE_LABELS[f.type as FieldType]?.() ?? f.type} ·{" "}
						{m.fields_key({ key: f.key })}
					</p>
				</div>
				<div className="flex flex-wrap gap-1">
					{f.required ? (
						<Badge variant="secondary">{m.fields_required()}</Badge>
					) : null}
					{f.unique ? (
						<Badge variant="secondary">{m.fields_unique()}</Badge>
					) : null}
					{f.archivedAt ? (
						<Badge variant="outline">{m.fields_archived()}</Badge>
					) : null}
				</div>
				{canManage ? (
					<div className="flex gap-1">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							disabled={i === 0}
							aria-label={m.fields_move_up({ name })}
							onClick={() => move("field", siblings, f.id, -1)}
						>
							<ArrowUp />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							disabled={i === siblings.length - 1}
							aria-label={m.fields_move_down({ name })}
							onClick={() => move("field", siblings, f.id, 1)}
						>
							<ArrowDown />
						</Button>
						{!f.archivedAt ? (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={m.fields_edit({ name })}
								onClick={() => setFieldDialog({ field: f })}
							>
								<Pencil />
							</Button>
						) : null}
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={
								f.archivedAt
									? m.fields_restore({ name })
									: m.fields_archive({ name })
							}
							onClick={() => {
								if (
									!f.archivedAt &&
									!window.confirm(m.fields_archive_confirm({ name }))
								)
									return;
								void run(
									() =>
										setFieldArchived({
											data: { id: f.id, archived: !f.archivedAt },
										}),
									f.archivedAt
										? m.fields_restored_ok({ name })
										: m.fields_archived_ok({ name }),
								);
							}}
						>
							{f.archivedAt ? <ArchiveRestore /> : <Archive />}
						</Button>
					</div>
				) : null}
			</li>
		);
	};

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">{m.fields_title()}</h1>
					<p className="text-sm text-muted-foreground">{m.fields_subtitle()}</p>
				</div>
				{canManage ? (
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setGroupDialog({ group: null })}
						>
							<FolderPlus /> {m.fields_new_group()}
						</Button>
						<Button
							type="button"
							onClick={() => setFieldDialog({ field: null })}
						>
							<Plus /> {m.fields_new()}
						</Button>
					</div>
				) : (
					<p className="flex items-center gap-2 text-sm text-muted-foreground">
						<Lock className="size-4" aria-hidden="true" />{" "}
						{m.fields_admin_only()}
					</p>
				)}
			</div>

			<div className="flex flex-wrap items-center justify-between gap-4">
				<fieldset className="inline-flex gap-1 rounded-lg bg-muted p-1">
					<legend className="sr-only">{m.fields_title()}</legend>
					{OBJECT_KEYS.map((key: ObjectKey) => (
						<button
							key={key}
							type="button"
							aria-pressed={object === key}
							onClick={() =>
								void navigate({ search: (prev) => ({ ...prev, object: key }) })
							}
							className={`rounded-md px-3 py-1 text-sm font-medium ${object === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
						>
							{key === "contact"
								? m.nav_contacts()
								: key === "company"
									? m.nav_companies()
									: key === "deal"
										? m.nav_deals()
										: key === "product"
											? m.nav_products()
											: m.nav_quotes()}
						</button>
					))}
				</fieldset>
				<div className="flex items-center gap-2">
					<Checkbox
						id="show-archived"
						checked={showArchived}
						onCheckedChange={(c) =>
							void navigate({
								search: (prev) => ({ ...prev, archived: c === true }),
							})
						}
					/>
					<Label htmlFor="show-archived" className="font-normal">
						{m.fields_show_archived()}
					</Label>
				</div>
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			{canManage && templateMissing > 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{m.template_title()}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-wrap items-center gap-4">
						<p className="flex-1 text-sm text-muted-foreground">
							{m.template_missing({
								fields: template.fieldsMissing,
								views: template.viewsMissing,
								pipelines: template.pipelinesMissing,
							})}
						</p>
						<Button
							type="button"
							disabled={applying}
							onClick={async () => {
								setApplying(true);
								await run(async () => {
									const added = await applyGenericTemplate();
									setStatus({ ok: true, message: m.template_applied(added) });
								});
								setApplying(false);
							}}
						>
							{applying ? m.template_applying() : m.template_apply()}
						</Button>
					</CardContent>
				</Card>
			) : null}

			{fields.length === 0 && groups.length === 0 ? (
				<p className="text-sm text-muted-foreground">{m.fields_empty()}</p>
			) : (
				sections.map(({ group, fields: list }) => {
					if (!group && list.length === 0) return null;
					const name = group ? localized(group.label) : m.fields_no_group();
					const gi = group ? visibleGroups.indexOf(group) : -1;
					return (
						<Card key={group?.id ?? "none"}>
							<CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
								<CardTitle className="flex-1 text-base">
									{name}{" "}
									{group?.archivedAt ? (
										<Badge variant="outline">{m.fields_archived()}</Badge>
									) : null}
								</CardTitle>
								{group && canManage ? (
									<div className="flex gap-1">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											disabled={gi === 0}
											aria-label={m.fields_move_up({ name })}
											onClick={() => move("group", visibleGroups, group.id, -1)}
										>
											<ArrowUp />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											disabled={gi === visibleGroups.length - 1}
											aria-label={m.fields_move_down({ name })}
											onClick={() => move("group", visibleGroups, group.id, 1)}
										>
											<ArrowDown />
										</Button>
										{!group.archivedAt ? (
											<Button
												type="button"
												variant="ghost"
												size="icon"
												aria-label={m.fields_edit({ name })}
												onClick={() => setGroupDialog({ group })}
											>
												<Pencil />
											</Button>
										) : null}
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={
												group.archivedAt
													? m.fields_restore({ name })
													: m.fields_archive({ name })
											}
											onClick={() => {
												if (
													!group.archivedAt &&
													!window.confirm(
														m.fields_group_archive_confirm({ name }),
													)
												)
													return;
												void run(
													() =>
														setGroupArchived({
															data: {
																id: group.id,
																archived: !group.archivedAt,
															},
														}),
													group.archivedAt
														? m.fields_restored_ok({ name })
														: m.fields_archived_ok({ name }),
												);
											}}
										>
											{group.archivedAt ? <ArchiveRestore /> : <Archive />}
										</Button>
									</div>
								) : null}
							</CardHeader>
							<CardContent>
								{list.length ? (
									<ul className="divide-y">
										{list.map((f) => fieldRow(f, list))}
									</ul>
								) : (
									<p className="text-sm text-muted-foreground">
										{m.fields_empty()}
									</p>
								)}
							</CardContent>
						</Card>
					);
				})
			)}

			<FieldDialog
				open={fieldDialog !== null}
				onOpenChange={(open) => !open && setFieldDialog(null)}
				objectKey={object}
				field={fieldDialog?.field ?? null}
				groups={activeGroups}
				onSaved={async (name) => {
					setFieldDialog(null);
					setStatus({ ok: true, message: m.fields_saved({ name }) });
					await router.invalidate();
				}}
			/>
			{groupDialog ? (
				<GroupDialog
					open
					onOpenChange={(open) => !open && setGroupDialog(null)}
					objectKey={object}
					group={groupDialog.group}
					onSaved={async (name) => {
						setGroupDialog(null);
						setStatus({ ok: true, message: m.fields_saved({ name }) });
						await router.invalidate();
					}}
				/>
			) : null}
		</div>
	);
}
