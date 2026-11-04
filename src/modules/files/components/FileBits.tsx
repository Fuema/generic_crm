import { useRouter } from "@tanstack/react-router";
import { Download, FileText, Share2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { roleCan } from "#/lib/permissions";
import { SUBJECT_RESOURCE, type SubjectType } from "#/modules/records/schema";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import { deleteFile, type FileItem, setFileShared } from "../files";
import {
	ACCEPT,
	contentTypeFor,
	FILE_LIMITS,
	formatBytes,
	type UploadTarget,
} from "../schema";

export type Notice = { ok: boolean; message: string } | null;

// Checks in the browser first (the server checks again), then uploads
export async function sendFile(target: UploadTarget, picked: File) {
	if (!contentTypeFor(picked.name)) throw new Error(m.error_file_type());
	if (picked.size > FILE_LIMITS.maxFileBytes)
		throw new Error(m.error_file_too_large());
	// The body is the file itself; the route checks the size, the session and
	// the right before reading it, then streams it to storage
	const response = await fetch(
		`/api/files?target=${encodeURIComponent(JSON.stringify(target))}`,
		{
			method: "POST",
			body: picked,
			headers: {
				"Content-Type": "application/octet-stream",
				"X-File-Name": encodeURIComponent(picked.name),
			},
		},
	);
	if (!response.ok) throw response;
	return (await response.json()) as { id: string };
}

// A button that picks one or more files and uploads them one by one
export function UploadButton({
	target,
	label = m.files_upload(),
	size = "sm",
	onDone,
}: {
	target: UploadTarget;
	label?: string;
	size?: "sm" | "default";
	onDone: (notice: Notice) => void;
}) {
	const input = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	return (
		<>
			<input
				ref={input}
				type="file"
				multiple
				accept={ACCEPT}
				className="sr-only"
				tabIndex={-1}
				aria-hidden="true"
				onChange={async (e) => {
					const picked = [...(e.target.files ?? [])];
					e.target.value = "";
					if (!picked.length) return;
					setBusy(true);
					let done = 0;
					try {
						for (const f of picked) {
							await sendFile(target, f);
							done++;
						}
						onDone({ ok: true, message: m.files_uploaded({ count: done }) });
					} catch (error) {
						onDone({ ok: false, message: await serverErrorMessage(error) });
					} finally {
						setBusy(false);
					}
				}}
			/>
			<Button
				type="button"
				size={size}
				variant="outline"
				disabled={busy}
				onClick={() => input.current?.click()}
			>
				<Upload /> {busy ? m.files_uploading() : label}
			</Button>
		</>
	);
}

export function downloadUrl(id: string) {
	return `/api/files/${id}`;
}

// Files with download links; share and delete where allowed
export function FileList({
	files,
	canShare,
	canDelete,
	onChanged,
	empty = m.files_none_here(),
}: {
	files: FileItem[];
	canShare: boolean;
	canDelete: (file: FileItem) => boolean;
	onChanged: (notice: Notice) => void;
	empty?: string;
}) {
	const [busy, setBusy] = useState<string | null>(null);
	const run = async (
		id: string,
		action: () => Promise<unknown>,
		ok: string,
	) => {
		setBusy(id);
		try {
			await action();
			onChanged({ ok: true, message: ok });
		} catch (error) {
			onChanged({ ok: false, message: await serverErrorMessage(error) });
		} finally {
			setBusy(null);
		}
	};
	if (!files.length)
		return <p className="text-sm text-muted-foreground">{empty}</p>;
	return (
		<ul className="divide-y">
			{files.map((f) => (
				<li key={f.id} className="flex flex-wrap items-center gap-2 py-2">
					<FileText
						className="size-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					<a
						href={downloadUrl(f.id)}
						className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
						download={f.name}
					>
						{f.name}
					</a>
					{f.sharedWithCustomer ? (
						<Badge variant="secondary">{m.files_shared_badge()}</Badge>
					) : null}
					<span className="text-xs text-muted-foreground">
						{formatBytes(f.sizeBytes, getLocale())} ·{" "}
						{new Date(f.createdAt).toLocaleDateString(getLocale())}
						{f.uploaderName ? ` · ${f.uploaderName}` : ""}
					</span>
					<a
						href={downloadUrl(f.id)}
						download={f.name}
						className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
						aria-label={m.files_download({ name: f.name })}
					>
						<Download className="size-4" />
					</a>
					{canShare ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-8"
							disabled={busy === f.id}
							aria-pressed={f.sharedWithCustomer}
							aria-label={
								f.sharedWithCustomer
									? m.files_unshare({ name: f.name })
									: m.files_share({ name: f.name })
							}
							title={m.files_share_hint()}
							onClick={() =>
								run(
									f.id,
									() =>
										setFileShared({
											data: { id: f.id, shared: !f.sharedWithCustomer },
										}),
									f.sharedWithCustomer
										? m.files_unshared_notice({ name: f.name })
										: m.files_shared_notice({ name: f.name }),
								)
							}
						>
							<Share2 className="size-4" />
						</Button>
					) : null}
					{canDelete(f) ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-8"
							disabled={busy === f.id}
							aria-label={m.files_delete({ name: f.name })}
							onClick={() => {
								if (!window.confirm(m.files_delete_confirm({ name: f.name })))
									return;
								void run(
									f.id,
									() => deleteFile({ data: { id: f.id } }),
									m.files_deleted({ name: f.name }),
								);
							}}
						>
							<Trash2 className="size-4" />
						</Button>
					) : null}
				</li>
			))}
		</ul>
	);
}

// A record's own folder, on its page. Rights follow the record.
export function RecordFiles({
	subjectType,
	subjectId,
	files,
	role,
	userId,
	archived = false,
	className,
}: {
	subjectType: SubjectType;
	subjectId: string;
	files: FileItem[];
	role: string | undefined;
	userId: string;
	archived?: boolean;
	className?: string;
}) {
	const router = useRouter();
	const [notice, setNotice] = useState<Notice>(null);
	const resource = SUBJECT_RESOURCE[subjectType];
	const canUpdate = !archived && roleCan(role, { [resource]: ["update"] });
	const canDeleteAny = roleCan(role, { [resource]: ["delete"] });
	const done = async (n: Notice) => {
		setNotice(n);
		await router.invalidate();
	};
	// Receipts are listed with their payment
	const own = files.filter((f) => !f.paymentId);
	return (
		<Card className={className}>
			<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
				<CardTitle>{m.files_title()}</CardTitle>
				{canUpdate ? (
					<UploadButton
						target={{ kind: "record", subjectType, subjectId, paymentId: "" }}
						onDone={done}
					/>
				) : null}
			</CardHeader>
			<CardContent className="space-y-3">
				<FormAlert
					message={notice?.message ?? null}
					variant={notice?.ok ? "success" : "destructive"}
				/>
				<FileList
					files={own}
					canShare={canUpdate}
					canDelete={(f) =>
						canDeleteAny || (canUpdate && f.uploadedById === userId)
					}
					onChanged={done}
				/>
				<p className="text-xs text-muted-foreground">
					{m.files_limits({
						size: formatBytes(FILE_LIMITS.maxFileBytes, getLocale()),
					})}
				</p>
			</CardContent>
		</Card>
	);
}
