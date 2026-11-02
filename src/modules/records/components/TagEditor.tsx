import { X } from "lucide-react";
import { useId, useState } from "react";
import { serverErrorMessage } from "#/components/data/serverError";
import { Input } from "#/components/ui/input";
import { m } from "#/paraglide/messages.js";
import { addTag, removeTag, type TagChip } from "../records";
import type { SubjectType, TagColor } from "../schema";

// Light and dark styles per palette color
const COLOR_CLASSES: Record<TagColor, string> = {
	gray: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
	red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
	orange:
		"bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
	amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
	green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
	teal: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
	blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
	violet:
		"bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
	pink: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
};

export function TagPill({
	tag,
	onRemove,
}: {
	tag: TagChip;
	onRemove?: () => void;
}) {
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_CLASSES[tag.color as TagColor] ?? COLOR_CLASSES.gray}`}
		>
			{tag.name}
			{onRemove ? (
				<button
					type="button"
					onClick={onRemove}
					aria-label={m.tags_remove({ name: tag.name })}
					className="rounded-full opacity-70 hover:opacity-100"
				>
					<X className="size-3" />
				</button>
			) : null}
		</span>
	);
}

// The tags on one record; editors add by typing (existing names are suggested)
export function TagEditor({
	subjectType,
	subjectId,
	tags,
	allTags,
	canEdit,
	onChanged,
}: {
	subjectType: SubjectType;
	subjectId: string;
	tags: TagChip[];
	allTags: TagChip[];
	canEdit: boolean;
	onChanged: () => Promise<void>;
}) {
	const listId = useId();
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const suggestions = allTags.filter((t) => !tags.some((c) => c.id === t.id));

	const run = async (action: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await action();
			await onChanged();
		} catch (e) {
			setError(await serverErrorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	const add = () => {
		const name = text.trim();
		if (!name) return;
		void run(async () => {
			await addTag({ data: { subjectType, subjectId, name } });
			setText("");
		});
	};

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-1.5">
				{tags.length ? (
					tags.map((t) => (
						<TagPill
							key={t.id}
							tag={t}
							onRemove={
								canEdit && !busy
									? () =>
											void run(() =>
												removeTag({
													data: { subjectType, subjectId, tagId: t.id },
												}),
											)
									: undefined
							}
						/>
					))
				) : (
					<p className="text-sm text-muted-foreground">{m.tags_none()}</p>
				)}
			</div>
			{canEdit ? (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						add();
					}}
				>
					<label htmlFor={`${listId}-input`} className="sr-only">
						{m.tags_add()}
					</label>
					<Input
						id={`${listId}-input`}
						list={listId}
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder={m.tags_add_placeholder()}
						maxLength={40}
						disabled={busy}
						aria-invalid={Boolean(error)}
						aria-describedby={error ? `${listId}-error` : undefined}
						className="h-8 text-sm"
					/>
					<datalist id={listId}>
						{suggestions.map((t) => (
							<option key={t.id} value={t.name} />
						))}
					</datalist>
				</form>
			) : null}
			{error ? (
				<p
					id={`${listId}-error`}
					role="alert"
					className="text-sm text-destructive"
				>
					{error}
				</p>
			) : null}
		</div>
	);
}
