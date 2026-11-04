import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { OptionSelect } from "#/modules/contacts/components/fields";
import { m } from "#/paraglide/messages.js";
import type { FolderOption } from "../files";
import { folderNameSchema } from "../schema";

export type FolderAction =
	| { kind: "create"; parentId: string }
	| { kind: "rename"; id: string; name: string }
	| { kind: "move"; id: string; name: string; parentId: string };

// Every folder as "a / b / c", except the moved one and what's inside it
function folderChoices(all: FolderOption[], excludeId: string) {
	const byId = new Map(all.map((f) => [f.id, f]));
	const pathOf = (f: FolderOption) => {
		const names: string[] = [];
		let at: FolderOption | undefined = f;
		for (let i = 0; at && i < 50; i++) {
			if (at.id === excludeId) return null;
			names.unshift(at.name);
			at = at.parentId ? byId.get(at.parentId) : undefined;
		}
		return names.join(" / ");
	};
	return all
		.map((f) => ({ value: f.id, label: pathOf(f) }))
		.filter((o): o is { value: string; label: string } => o.label !== null)
		.sort((x, y) => x.label.localeCompare(y.label));
}

export function FolderDialog({
	action,
	folders,
	onClose,
	onSubmit,
}: {
	action: FolderAction;
	folders: FolderOption[];
	onClose: () => void;
	onSubmit: (value: { name: string; parentId: string }) => Promise<void>;
}) {
	const [name, setName] = useState(action.kind === "create" ? "" : action.name);
	const [parentId, setParentId] = useState(
		action.kind === "move" ? action.parentId : "",
	);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const submit = async () => {
		if (action.kind !== "move") {
			const parsed = folderNameSchema.safeParse(name);
			if (!parsed.success) {
				setError(parsed.error.issues[0].message);
				return;
			}
		}
		setError(null);
		setBusy(true);
		try {
			await onSubmit({ name: name.trim(), parentId });
		} catch (e) {
			setError(await serverErrorMessage(e));
			setBusy(false);
		}
	};

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{action.kind === "create"
							? m.folders_new()
							: action.kind === "rename"
								? m.folders_rename_title()
								: m.folders_move_title({ name: action.name })}
					</DialogTitle>
				</DialogHeader>
				<form
					noValidate
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						void submit();
					}}
				>
					<FormAlert message={error} />
					{action.kind === "move" ? (
						<OptionSelect
							id="folder-parent"
							label={m.folders_move_to()}
							value={parentId}
							onChange={setParentId}
							emptyLabel={m.folders_top_level()}
							options={folderChoices(folders, action.id)}
						/>
					) : (
						<div className="space-y-2">
							<Label htmlFor="folder-name">{m.folders_name()}</Label>
							<Input
								id="folder-name"
								value={name}
								maxLength={80}
								autoComplete="off"
								autoFocus
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
					)}
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={onClose}>
							{m.common_cancel()}
						</Button>
						<Button type="submit" disabled={busy}>
							{busy ? m.common_saving() : m.folders_save()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
