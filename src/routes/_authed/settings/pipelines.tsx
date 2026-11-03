import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { roleCan } from "#/lib/permissions";
import { localized } from "#/modules/fields/schema";
import { PipelineDialog } from "#/modules/pipelines/components/PipelineDialog";
import {
	archivePipeline,
	listPipelines,
	type Pipelines,
	restorePipeline,
} from "#/modules/pipelines/pipelines";
import { STAGE_TYPE_LABELS } from "#/modules/pipelines/schema";
import { m } from "#/paraglide/messages.js";

// Settings → Pipelines. Everyone can see them; owners and admins change them
// (every server function checks the pipeline permission again).
export const Route = createFileRoute("/_authed/settings/pipelines")({
	validateSearch: z.object({
		archived: z.boolean().catch(false).default(false),
	}),
	loader: () => listPipelines({ data: { includeArchived: true } }),
	component: PipelinesPage,
});

type Pipeline = Pipelines[number];
type Status = { ok: boolean; message: string } | null;

function PipelinesPage() {
	const router = useRouter();
	const navigate = Route.useNavigate();
	const { archived: showArchived } = Route.useSearch();
	const pipelines = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const canManage = roleCan(access?.role, { pipeline: ["update"] });
	const [status, setStatus] = useState<Status>(null);
	const [dialog, setDialog] = useState<{ pipeline: Pipeline | null } | null>(
		null,
	);
	const visible = pipelines.filter((p) => showArchived || !p.archivedAt);

	const run = async (action: () => Promise<unknown>, message: string) => {
		setStatus(null);
		try {
			await action();
			setStatus({ ok: true, message });
			await router.invalidate();
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	return (
		<div className="mx-auto max-w-4xl space-y-6 p-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-2xl font-bold">{m.pipelines_title()}</h1>
					<p className="text-sm text-muted-foreground">
						{m.pipelines_description()}
					</p>
				</div>
				{canManage ? (
					<Button type="button" onClick={() => setDialog({ pipeline: null })}>
						<Plus /> {m.pipeline_new()}
					</Button>
				) : null}
			</div>

			<div className="flex items-center gap-2">
				<Switch
					id="show-archived"
					checked={showArchived}
					onCheckedChange={(checked) =>
						navigate({ search: { archived: checked }, replace: true })
					}
				/>
				<Label htmlFor="show-archived">{m.common_show_archived()}</Label>
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			{visible.length === 0 ? (
				<p className="text-sm text-muted-foreground">{m.pipelines_empty()}</p>
			) : (
				visible.map((p) => {
					const name = localized(p.name);
					return (
						<Card key={p.id}>
							<CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
								<CardTitle className="flex-1 text-base">
									{name}
									{p.archivedAt ? (
										<Badge variant="outline" className="ml-2">
											{m.pipelines_archived_badge()}
										</Badge>
									) : null}
								</CardTitle>
								{canManage && !p.archivedAt ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setDialog({ pipeline: p })}
									>
										<Pencil /> {m.common_edit()}
									</Button>
								) : null}
								{canManage ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										aria-label={
											p.archivedAt
												? m.pipeline_restore_label({ name })
												: m.pipeline_archive_label({ name })
										}
										onClick={() =>
											run(
												() =>
													(p.archivedAt ? restorePipeline : archivePipeline)({
														data: { id: p.id },
													}),
												p.archivedAt
													? m.pipeline_restored({ name })
													: m.pipeline_archived({ name }),
											)
										}
									>
										{p.archivedAt ? <ArchiveRestore /> : <Archive />}
										{p.archivedAt ? m.common_restore() : m.common_archive()}
									</Button>
								) : null}
							</CardHeader>
							<CardContent>
								<ol className="flex flex-wrap gap-2">
									{p.stages.map((s) => (
										<li
											key={s.id}
											className="rounded-md border px-2 py-1 text-sm"
										>
											<span className="font-medium">{localized(s.name)}</span>
											<span className="ml-2 text-xs text-muted-foreground">
												{s.type === "open"
													? `${s.probability} %`
													: STAGE_TYPE_LABELS[s.type]()}
											</span>
										</li>
									))}
								</ol>
							</CardContent>
						</Card>
					);
				})
			)}

			{dialog ? (
				<PipelineDialog
					key={dialog.pipeline?.id ?? "new"}
					open
					onOpenChange={(open) => {
						if (!open) setDialog(null);
					}}
					pipeline={dialog.pipeline}
					onSaved={async (name) => {
						setDialog(null);
						setStatus({
							ok: true,
							message: dialog.pipeline
								? m.pipeline_updated({ name })
								: m.pipeline_created({ name }),
						});
						await router.invalidate();
					}}
				/>
			) : null}
		</div>
	);
}
