import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
	ChevronRight,
	Folder,
	FolderInput,
	FolderPlus,
	Pencil,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { Meter } from "#/components/Dashboard/StatTile";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { roleCan } from "#/lib/permissions";
import {
	FileList,
	type Notice,
	UploadButton,
} from "#/modules/files/components/FileBits";
import {
	type FolderAction,
	FolderDialog,
} from "#/modules/files/components/FolderDialog";
import {
	createFolder,
	deleteFolder,
	listAllFolders,
	listFolder,
	moveFolder,
	renameFolder,
} from "#/modules/files/files";
import { filesSearchSchema, formatBytes } from "#/modules/files/schema";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

// Protected by the _authed guard; listFolder requires file:read. Shared
// workspace documents in nested folders; record files live on their records.
export const Route = createFileRoute("/_authed/files")({
	validateSearch: filesSearchSchema,
	loaderDeps: ({ search }) => ({ folder: search.folder }),
	loader: async ({ deps }) => {
		const [listing, folders] = await Promise.all([
			listFolder({ data: { folderId: deps.folder ?? "" } }),
			listAllFolders(),
		]);
		return { listing, folders };
	},
	component: FilesPage,
});

function FilesPage() {
	const router = useRouter();
	const { listing, folders } = Route.useLoaderData();
	const { access } = Route.useRouteContext();
	const role = access?.role;
	const can = {
		create: roleCan(role, { file: ["create"] }),
		update: roleCan(role, { file: ["update"] }),
		delete: roleCan(role, { file: ["delete"] }),
	};
	const [notice, setNotice] = useState<Notice>(null);
	const [action, setAction] = useState<FolderAction | null>(null);
	const folderId = listing.folder?.id ?? "";
	const locale = getLocale();

	const done = async (n: Notice) => {
		setNotice(n);
		await router.invalidate();
	};
	const removeFolder = async (id: string, name: string) => {
		if (!window.confirm(m.folders_delete_confirm({ name }))) return;
		try {
			await deleteFolder({ data: { id } });
			await done({ ok: true, message: m.folders_deleted({ name }) });
		} catch (e) {
			setNotice({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	return (
		<div className="mx-auto max-w-5xl space-y-5 p-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">{m.files_page_title()}</h1>
					<p className="text-sm text-muted-foreground">
						{m.files_page_summary()}
					</p>
				</div>
				<div className="flex gap-2">
					{can.create ? (
						<>
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									setAction({ kind: "create", parentId: folderId })
								}
							>
								<FolderPlus /> {m.folders_new()}
							</Button>
							<UploadButton
								size="default"
								target={{ kind: "folder", folderId }}
								onDone={done}
							/>
						</>
					) : null}
				</div>
			</div>

			<div className="max-w-sm space-y-1 text-sm">
				<p className="text-muted-foreground">
					{m.files_usage({
						used: formatBytes(listing.usage.used, locale),
						quota: formatBytes(listing.usage.quota, locale),
					})}
				</p>
				<Meter value={listing.usage.used} max={listing.usage.quota} />
			</div>

			<FormAlert
				message={notice?.message ?? null}
				variant={notice?.ok ? "success" : "destructive"}
			/>

			<nav aria-label={m.folders_path()}>
				<ol className="flex flex-wrap items-center gap-1 text-sm">
					<li>
						<Link
							to="/files"
							search={{}}
							className={folderId ? "hover:underline" : "font-semibold"}
						>
							{m.files_page_title()}
						</Link>
					</li>
					{listing.path.map((p, i) => (
						<li key={p.id} className="flex items-center gap-1">
							<ChevronRight
								className="size-3.5 text-muted-foreground"
								aria-hidden="true"
							/>
							{i === listing.path.length - 1 ? (
								<span className="font-semibold" aria-current="page">
									{p.name}
								</span>
							) : (
								<Link
									to="/files"
									search={{ folder: p.id }}
									className="hover:underline"
								>
									{p.name}
								</Link>
							)}
						</li>
					))}
				</ol>
			</nav>

			<Card>
				<CardContent className="space-y-4">
					{listing.folders.length ? (
						<ul className="divide-y" aria-label={m.folders_label()}>
							{listing.folders.map((f) => (
								<li key={f.id} className="flex items-center gap-2 py-2">
									<Folder
										className="size-4 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
									<Link
										to="/files"
										search={{ folder: f.id }}
										className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
									>
										{f.name}
									</Link>
									{can.update ? (
										<>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-8"
												aria-label={m.folders_rename({ name: f.name })}
												onClick={() =>
													setAction({ kind: "rename", id: f.id, name: f.name })
												}
											>
												<Pencil className="size-4" />
											</Button>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="size-8"
												aria-label={m.folders_move({ name: f.name })}
												onClick={() =>
													setAction({
														kind: "move",
														id: f.id,
														name: f.name,
														parentId: folderId,
													})
												}
											>
												<FolderInput className="size-4" />
											</Button>
										</>
									) : null}
									{can.delete ? (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-8"
											aria-label={m.folders_delete({ name: f.name })}
											onClick={() => removeFolder(f.id, f.name)}
										>
											<Trash2 className="size-4" />
										</Button>
									) : null}
								</li>
							))}
						</ul>
					) : null}
					<FileList
						files={listing.files}
						canShare={false}
						canDelete={() => can.delete}
						onChanged={done}
						empty={
							listing.folders.length ? m.files_none_here() : m.folders_empty()
						}
					/>
				</CardContent>
			</Card>
			<p className="text-xs text-muted-foreground">{m.files_record_hint()}</p>

			{action ? (
				<FolderDialog
					action={action}
					folders={folders}
					onClose={() => setAction(null)}
					onSubmit={async ({ name, parentId }) => {
						if (action.kind === "create") {
							await createFolder({ data: { name, parentId: action.parentId } });
							await done({ ok: true, message: m.folders_created({ name }) });
						} else if (action.kind === "rename") {
							await renameFolder({ data: { id: action.id, name } });
							await done({ ok: true, message: m.folders_renamed({ name }) });
						} else {
							await moveFolder({ data: { id: action.id, parentId } });
							await done({
								ok: true,
								message: m.folders_moved({ name: action.name }),
							});
						}
						setAction(null);
					}}
				/>
			) : null}
		</div>
	);
}
