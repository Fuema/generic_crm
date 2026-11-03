import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type { FieldDef, ObjectKey } from "#/modules/fields/schema";
import { localized } from "#/modules/fields/schema";
import { fromFormValue, toFormValue } from "#/modules/fields/values";
import { m } from "#/paraglide/messages.js";
import {
	BUILT_IN_FIELDS,
	CUSTOM_KIND,
	type Filter,
	type FilterKind,
	fieldKind,
	filterProblem,
	KIND_OPERATORS,
	type Operator,
} from "../schema";

export type Choice = { value: string; label: string };

// Options for built-in choice and reference fields, supplied by the page
export type FilterChoices = Record<string, Choice[]>;

function operatorLabel(op: Operator, kind: FilterKind) {
	switch (op) {
		case "contains":
			return m.op_contains();
		case "is":
			return m.op_is();
		case "eq":
			return m.op_eq();
		case "gt":
			return kind === "date" ? m.op_gt_date() : m.op_gt_number();
		case "lt":
			return kind === "date" ? m.op_lt_date() : m.op_lt_number();
		case "between":
			return m.op_between();
		case "any_of":
			return m.op_any_of();
		case "is_true":
			return m.op_is_true();
		case "is_false":
			return m.op_is_false();
		case "is_empty":
			return m.op_is_empty();
		case "not_empty":
			return m.op_not_empty();
	}
}

// Money and percent filters are typed like the field's input and stored like its values
function toInput(def: FieldDef | undefined, v: unknown) {
	if (v === undefined || v === null) return "";
	if (def && (def.type === "money" || def.type === "percent"))
		return String(toFormValue(def, v));
	return String(v);
}
function fromInput(def: FieldDef | undefined, kind: FilterKind, text: string) {
	if (kind === "date") return text;
	if (def) return fromFormValue(def, text) ?? undefined;
	const n = Number(text);
	return text.trim() && Number.isFinite(n) ? n : text;
}

export function fieldLabel(
	objectKey: ObjectKey,
	field: string,
	defs: FieldDef[],
) {
	if (field.startsWith("custom.")) {
		const def = defs.find((d) => `custom.${d.key}` === field);
		return def ? localized(def.label) : field;
	}
	return BUILT_IN_FIELDS[objectKey][field]?.label() ?? field;
}

function ValueInput({
	id,
	filter,
	kind,
	def,
	choices,
	onChange,
}: {
	id: string;
	filter: Filter;
	kind: FilterKind;
	def?: FieldDef;
	choices: Choice[];
	onChange: (value: Filter["value"]) => void;
}) {
	const op = filter.op;
	if (["is_empty", "not_empty", "is_true", "is_false"].includes(op))
		return null;
	if (op === "any_of") {
		const selected = Array.isArray(filter.value)
			? (filter.value as string[])
			: [];
		return (
			<fieldset className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 sm:col-span-3">
				<legend className="sr-only">{m.filters_value()}</legend>
				{choices.map((c) => (
					<div key={c.value} className="flex items-center gap-2">
						<Checkbox
							id={`${id}-${c.value}`}
							checked={selected.includes(c.value)}
							onCheckedChange={(on) =>
								onChange(
									on === true
										? [...selected, c.value]
										: selected.filter((v) => v !== c.value),
								)
							}
						/>
						<Label htmlFor={`${id}-${c.value}`} className="font-normal">
							{c.label}
						</Label>
					</div>
				))}
			</fieldset>
		);
	}
	const type = kind === "date" ? "date" : "text";
	const inputMode = kind === "number" ? "decimal" : undefined;
	if (op === "between") {
		const pair = Array.isArray(filter.value) ? filter.value : ["", ""];
		return (
			<div className="grid grid-cols-2 gap-2 sm:col-span-3">
				{[0, 1].map((i) => (
					<div key={i} className="space-y-1">
						<Label htmlFor={`${id}-${i}`} className="text-xs">
							{i === 0 ? m.filters_from() : m.filters_to()}
						</Label>
						<Input
							id={`${id}-${i}`}
							type={type}
							inputMode={inputMode}
							value={toInput(def, pair[i])}
							onChange={(e) => {
								const next = [...pair] as [string | number, string | number];
								next[i] = fromInput(def, kind, e.target.value) as
									| string
									| number;
								onChange(next);
							}}
						/>
					</div>
				))}
			</div>
		);
	}
	return (
		<div className="space-y-1 sm:col-span-3">
			<Label htmlFor={id} className="sr-only">
				{m.filters_value()}
			</Label>
			<Input
				id={id}
				type={type}
				inputMode={inputMode}
				maxLength={255}
				value={toInput(def, filter.value)}
				onChange={(e) =>
					onChange(fromInput(def, kind, e.target.value) as Filter["value"])
				}
			/>
		</div>
	);
}

// Edits a copy of the filters; nothing changes until "Apply"
export function FilterEditor({
	open,
	onOpenChange,
	objectKey,
	filters,
	defs,
	choices,
	onApply,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	objectKey: ObjectKey;
	filters: Filter[];
	defs: FieldDef[];
	choices: FilterChoices;
	onApply: (filters: Filter[]) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{m.filters_title()}</DialogTitle>
					<DialogDescription>{m.filters_hint()}</DialogDescription>
				</DialogHeader>
				{open ? (
					<FilterRows
						objectKey={objectKey}
						initial={filters}
						defs={defs}
						choices={choices}
						onCancel={() => onOpenChange(false)}
						onApply={onApply}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function FilterRows({
	objectKey,
	initial,
	defs,
	choices,
	onCancel,
	onApply,
}: {
	objectKey: ObjectKey;
	initial: Filter[];
	defs: FieldDef[];
	choices: FilterChoices;
	onCancel: () => void;
	onApply: (filters: Filter[]) => void;
}) {
	const [rows, setRows] = useState<Filter[]>(initial);
	const [error, setError] = useState<string | null>(null);
	const active = defs.filter((d) => !d.archivedAt && CUSTOM_KIND[d.type]);
	const fieldOptions = [
		...Object.entries(BUILT_IN_FIELDS[objectKey]).map(([id, f]) => ({
			id,
			label: f.label(),
		})),
		...active.map((d) => ({
			id: `custom.${d.key}`,
			label: localized(d.label),
		})),
	];
	const update = (i: number, patch: Partial<Filter>) =>
		setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));

	const choicesFor = (field: string, def?: FieldDef): Choice[] =>
		def
			? def.options.map((o) => ({ value: o.value, label: localized(o.label) }))
			: (choices[field] ?? []);

	return (
		<form
			noValidate
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				const problem = rows
					.map((r) => filterProblem(objectKey, r, defs))
					.find(Boolean);
				if (problem) {
					setError(problem);
					return;
				}
				onApply(rows);
			}}
		>
			<FormAlert message={error} />
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">{m.filters_none()}</p>
			) : null}
			{rows.map((row, i) => {
				const found = fieldKind(objectKey, row.field, defs);
				const kind = found?.kind ?? "text";
				const id = `filter-${i}`;
				return (
					<div
						key={id}
						className="grid items-start gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
					>
						<div className="space-y-1">
							<Label htmlFor={`${id}-field`} className="text-xs">
								{m.filters_field()}
							</Label>
							<select
								id={`${id}-field`}
								className="h-9 w-full rounded-md border bg-background px-2 text-sm"
								value={row.field}
								onChange={(e) => {
									const next = fieldKind(objectKey, e.target.value, defs);
									update(i, {
										field: e.target.value,
										op: KIND_OPERATORS[next?.kind ?? "text"][0],
										value: undefined,
									});
								}}
							>
								{fieldOptions.map((f) => (
									<option key={f.id} value={f.id}>
										{f.label}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-1">
							<Label htmlFor={`${id}-op`} className="text-xs">
								{m.filters_operator()}
							</Label>
							<select
								id={`${id}-op`}
								className="h-9 w-full rounded-md border bg-background px-2 text-sm"
								value={row.op}
								onChange={(e) =>
									update(i, {
										op: e.target.value as Operator,
										value: undefined,
									})
								}
							>
								{KIND_OPERATORS[kind].map((op) => (
									<option key={op} value={op}>
										{operatorLabel(op, kind)}
									</option>
								))}
							</select>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="mt-5"
							aria-label={m.filters_remove({ n: i + 1 })}
							onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
						>
							<Trash2 />
						</Button>
						<ValueInput
							id={`${id}-value`}
							filter={row}
							kind={kind}
							def={found?.def}
							choices={choicesFor(row.field, found?.def)}
							onChange={(value) => update(i, { value })}
						/>
					</div>
				);
			})}
			<div className="flex flex-wrap justify-between gap-2">
				<div className="flex gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							setRows((all) => [
								...all,
								{
									field: fieldOptions[0].id,
									op: KIND_OPERATORS.text[0],
									value: undefined,
								},
							])
						}
					>
						<Plus /> {m.filters_add()}
					</Button>
					{rows.length ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setRows([])}
						>
							{m.filters_clear()}
						</Button>
					) : null}
				</div>
			</div>
			<DialogFooter>
				<Button type="button" variant="ghost" onClick={onCancel}>
					{m.common_cancel()}
				</Button>
				<Button type="submit">{m.filters_apply()}</Button>
			</DialogFooter>
		</form>
	);
}
