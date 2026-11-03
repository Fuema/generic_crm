import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
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
import { OptionSelect } from "#/modules/contacts/components/fields";
import { m } from "#/paraglide/messages.js";
import { createField, createGroup, updateField, updateGroup } from "../fields";
import {
	CHOICE_TYPES,
	createFieldSchema,
	FIELD_LIMITS,
	FIELD_TYPES,
	type FieldDef,
	type FieldType,
	keyFromLabel,
	localized,
	type ObjectKey,
	UNIQUE_TYPES,
	updateFieldSchema,
} from "../schema";

export const TYPE_LABELS: Record<FieldType, () => string> = {
	text: m.field_type_text,
	long_text: m.field_type_long_text,
	number: m.field_type_number,
	money: m.field_type_money,
	percent: m.field_type_percent,
	date: m.field_type_date,
	checkbox: m.field_type_checkbox,
	single_choice: m.field_type_single_choice,
	multiple_choice: m.field_type_multiple_choice,
	email: m.field_type_email,
	phone: m.field_type_phone,
	url: m.field_type_url,
};

type OptionDraft = { value: string; en: string; es: string };

export function LocalizedInputs({
	id,
	labels,
	value,
	onChange,
	maxLength,
}: {
	id: string;
	labels: [string, string];
	value: { en: string; es: string };
	onChange: (v: { en: string; es: string }) => void;
	maxLength: number;
}) {
	return (
		<div className="grid gap-3 sm:grid-cols-2">
			{(["en", "es"] as const).map((lang, i) => (
				<div key={lang} className="space-y-2">
					<Label htmlFor={`${id}-${lang}`}>{labels[i]}</Label>
					<Input
						id={`${id}-${lang}`}
						lang={lang}
						value={value[lang]}
						onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
						maxLength={maxLength}
					/>
				</div>
			))}
		</div>
	);
}

// New options get a value from their label, unique within the field; existing
// options keep theirs (stored values point to it)
function optionValues(drafts: OptionDraft[]) {
	const used = new Set(drafts.filter((d) => d.value).map((d) => d.value));
	return drafts.map((d) => {
		if (d.value)
			return { value: d.value, label: { en: d.en.trim(), es: d.es.trim() } };
		const base = keyFromLabel({ en: d.en, es: d.es });
		let value = base;
		for (let i = 2; used.has(value); i++) value = `${base}_${i}`;
		used.add(value);
		return { value, label: { en: d.en.trim(), es: d.es.trim() } };
	});
}

export function FieldDialog({
	open,
	onOpenChange,
	objectKey,
	field,
	groups,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	objectKey: ObjectKey;
	field: FieldDef | null;
	groups: { id: string; label: { en: string; es: string } }[];
	onSaved: (name: string) => Promise<void>;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{field ? m.field_edit_title() : m.field_new_title()}
					</DialogTitle>
					<DialogDescription>{m.field_form_description()}</DialogDescription>
				</DialogHeader>
				{open ? (
					<FieldForm
						objectKey={objectKey}
						field={field}
						groups={groups}
						onCancel={() => onOpenChange(false)}
						onSaved={onSaved}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function FieldForm({
	objectKey,
	field,
	groups,
	onCancel,
	onSaved,
}: {
	objectKey: ObjectKey;
	field: FieldDef | null;
	groups: { id: string; label: { en: string; es: string } }[];
	onCancel: () => void;
	onSaved: (name: string) => Promise<void>;
}) {
	const [label, setLabel] = useState(field?.label ?? { en: "", es: "" });
	const [help, setHelp] = useState(field?.help ?? { en: "", es: "" });
	const [type, setType] = useState<FieldType>(
		(field?.type as FieldType) ?? "text",
	);
	const [groupId, setGroupId] = useState(field?.groupId ?? "");
	const [required, setRequired] = useState(field?.required ?? false);
	const [unique, setUnique] = useState(field?.unique ?? false);
	const [options, setOptions] = useState<OptionDraft[]>(
		field?.options.map((o) => ({ value: o.value, ...o.label })) ?? [],
	);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const isChoice = CHOICE_TYPES.includes(type);
	const canBeUnique = UNIQUE_TYPES.includes(type);

	const submit = async () => {
		setError(null);
		const common = {
			label,
			help,
			options: isChoice ? optionValues(options) : [],
			required,
			unique: canBeUnique && unique,
			groupId,
		};
		const parsed = field
			? updateFieldSchema.safeParse({ id: field.id, ...common })
			: createFieldSchema.safeParse({ objectKey, type, ...common });
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? m.error_generic());
			return;
		}
		setBusy(true);
		try {
			if (field)
				await updateField({
					data: parsed.data as typeof updateFieldSchema._output,
				});
			else
				await createField({
					data: parsed.data as typeof createFieldSchema._output,
				});
			await onSaved(localized(label));
		} catch (e) {
			setError(await serverErrorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<form
			noValidate
			className="space-y-4"
			onSubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<FormAlert message={error} />
			<LocalizedInputs
				id="field-label"
				labels={[m.field_label_en(), m.field_label_es()]}
				value={label}
				onChange={setLabel}
				maxLength={60}
			/>
			<LocalizedInputs
				id="field-help"
				labels={[m.field_help_en(), m.field_help_es()]}
				value={help}
				onChange={setHelp}
				maxLength={200}
			/>
			<div className="grid gap-3 sm:grid-cols-2">
				{field ? (
					<div className="space-y-2">
						<p className="text-sm font-medium">{m.field_type()}</p>
						<p className="text-sm text-muted-foreground">
							{TYPE_LABELS[type]?.() ?? type}
						</p>
					</div>
				) : (
					<OptionSelect
						id="field-type"
						label={m.field_type()}
						value={type}
						onChange={(v) => setType(v as FieldType)}
						options={FIELD_TYPES.map((t) => ({
							value: t,
							label: TYPE_LABELS[t](),
						}))}
					/>
				)}
				<OptionSelect
					id="field-group"
					label={m.field_group()}
					value={groupId}
					onChange={setGroupId}
					emptyLabel={m.fields_no_group()}
					options={groups.map((g) => ({
						value: g.id,
						label: localized(g.label),
					}))}
				/>
			</div>
			<div className="flex flex-wrap gap-6">
				<div className="flex items-center gap-2">
					<Checkbox
						id="field-required"
						checked={required}
						onCheckedChange={(c) => setRequired(c === true)}
					/>
					<Label htmlFor="field-required" className="font-normal">
						{m.field_required()}
					</Label>
				</div>
				{canBeUnique ? (
					<div className="flex items-center gap-2">
						<Checkbox
							id="field-unique"
							checked={unique}
							onCheckedChange={(c) => setUnique(c === true)}
						/>
						<Label htmlFor="field-unique" className="font-normal">
							{m.field_unique()}
						</Label>
					</div>
				) : null}
			</div>
			{isChoice ? (
				<fieldset className="space-y-3 border-t pt-4">
					<legend className="text-sm font-semibold">{m.field_options()}</legend>
					{options.map((o, i) => (
						<div key={o.value || `new-${i}`} className="flex items-end gap-2">
							<div className="grid flex-1 gap-2 sm:grid-cols-2">
								{(["en", "es"] as const).map((lang) => (
									<div key={lang} className="space-y-1">
										<Label htmlFor={`option-${i}-${lang}`} className="text-xs">
											{lang === "en"
												? m.field_option_en({ n: i + 1 })
												: m.field_option_es({ n: i + 1 })}
										</Label>
										<Input
											id={`option-${i}-${lang}`}
											lang={lang}
											value={o[lang]}
											maxLength={60}
											onChange={(e) =>
												setOptions((all) =>
													all.map((x, j) =>
														j === i ? { ...x, [lang]: e.target.value } : x,
													),
												)
											}
										/>
									</div>
								))}
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={m.field_remove_option({ n: i + 1 })}
								onClick={() =>
									setOptions((all) => all.filter((_, j) => j !== i))
								}
							>
								<Trash2 />
							</Button>
						</div>
					))}
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={options.length >= FIELD_LIMITS.optionsPerField}
						onClick={() =>
							setOptions((all) => [...all, { value: "", en: "", es: "" }])
						}
					>
						<Plus /> {m.field_add_option()}
					</Button>
				</fieldset>
			) : null}
			<DialogFooter>
				<Button type="button" variant="ghost" onClick={onCancel}>
					{m.common_cancel()}
				</Button>
				<Button type="submit" disabled={busy}>
					{busy
						? m.common_saving()
						: field
							? m.common_save_changes()
							: m.field_create()}
				</Button>
			</DialogFooter>
		</form>
	);
}

export function GroupDialog({
	open,
	onOpenChange,
	objectKey,
	group,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	objectKey: ObjectKey;
	group: { id: string; label: { en: string; es: string } } | null;
	onSaved: (name: string) => Promise<void>;
}) {
	const [label, setLabel] = useState(group?.label ?? { en: "", es: "" });
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{group ? m.group_edit_title() : m.group_new_title()}
					</DialogTitle>
					<DialogDescription>{m.group_form_description()}</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					className="space-y-4"
					onSubmit={async (e) => {
						e.preventDefault();
						setError(null);
						setBusy(true);
						try {
							if (group) await updateGroup({ data: { id: group.id, label } });
							else await createGroup({ data: { objectKey, label } });
							await onSaved(localized(label));
						} catch (err) {
							setError(await serverErrorMessage(err));
						} finally {
							setBusy(false);
						}
					}}
				>
					<FormAlert message={error} />
					<LocalizedInputs
						id="group-label"
						labels={[m.field_label_en(), m.field_label_es()]}
						value={label}
						onChange={setLabel}
						maxLength={60}
					/>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						>
							{m.common_cancel()}
						</Button>
						<Button type="submit" disabled={busy}>
							{busy
								? m.common_saving()
								: group
									? m.common_save_changes()
									: m.group_create()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
