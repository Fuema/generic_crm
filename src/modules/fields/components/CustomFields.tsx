import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { OptionSelect } from "#/modules/contacts/components/fields";
import { m } from "#/paraglide/messages.js";
import type { RecordFields } from "../fields";
import { type FieldDef, localized, validateCustomValues } from "../schema";
import {
	type FormValue,
	formatValue,
	fromFormValue,
	toFormValue,
} from "../values";

type Section = { id: string; label: string; fields: FieldDef[] };

// Fields grouped as on the record page: groups in order, then ungrouped fields
export function sectionsOf(
	fields: Pick<RecordFields, "groups" | "fields">,
): Section[] {
	const groupIds = new Set(fields.groups.map((g) => g.id));
	const sections: Section[] = fields.groups.map((g) => ({
		id: g.id,
		label: localized(g.label),
		fields: fields.fields.filter((f) => f.groupId === g.id),
	}));
	const other = fields.fields.filter(
		(f) => !f.groupId || !groupIds.has(f.groupId),
	);
	if (other.length)
		sections.push({ id: "other", label: m.custom_other(), fields: other });
	return sections.filter((s) => s.fields.length);
}

export function initialFormValues(
	fields: FieldDef[],
	custom: Record<string, unknown>,
) {
	return Object.fromEntries(
		fields.map((f) => [
			f.key,
			toFormValue(f, Object.hasOwn(custom, f.key) ? custom[f.key] : undefined),
		]),
	);
}

// Form values -> stored values, checked with the same rules the server uses
export function toCustomInput(
	fields: FieldDef[],
	values: Record<string, FormValue>,
) {
	const input = Object.fromEntries(
		fields.map((f) => [f.key, fromFormValue(f, values[f.key] ?? "")]),
	);
	const { errors } = validateCustomValues(fields, input);
	return { input, errors };
}

function FieldInput({
	def,
	value,
	onChange,
	error,
	currency,
}: {
	def: FieldDef;
	value: FormValue;
	onChange: (v: FormValue) => void;
	error?: string;
	currency: string;
}) {
	const id = `custom-${def.key}`;
	const label = `${localized(def.label)}${def.required ? " *" : ""}`;
	const help = localized(def.help);
	const describedBy =
		[error ? `${id}-error` : "", help ? `${id}-help` : ""]
			.filter(Boolean)
			.join(" ") || undefined;
	const text = typeof value === "string" ? value : "";

	let control: React.ReactNode;
	switch (def.type) {
		case "checkbox":
			return (
				<div className="flex items-start gap-2 sm:col-span-2">
					<Checkbox
						id={id}
						checked={value === true}
						onCheckedChange={(c) => onChange(c === true)}
						aria-describedby={describedBy}
					/>
					<div className="space-y-1">
						<Label htmlFor={id} className="font-normal">
							{label}
						</Label>
						{help ? (
							<p id={`${id}-help`} className="text-xs text-muted-foreground">
								{help}
							</p>
						) : null}
						{error ? (
							<p
								id={`${id}-error`}
								role="alert"
								className="text-sm text-destructive"
							>
								{error}
							</p>
						) : null}
					</div>
				</div>
			);
		case "single_choice":
			control = (
				<OptionSelect
					id={id}
					label={label}
					value={text}
					onChange={onChange}
					emptyLabel={m.custom_choose()}
					options={def.options.map((o) => ({
						value: o.value,
						label: localized(o.label),
					}))}
				/>
			);
			break;
		case "multiple_choice": {
			const selected = Array.isArray(value) ? value : [];
			control = (
				<fieldset className="space-y-2" aria-describedby={describedBy}>
					<legend className="text-sm font-medium">{label}</legend>
					<div className="flex flex-wrap gap-x-4 gap-y-2">
						{def.options.map((o) => (
							<div key={o.value} className="flex items-center gap-2">
								<Checkbox
									id={`${id}-${o.value}`}
									checked={selected.includes(o.value)}
									onCheckedChange={(c) =>
										onChange(
											c === true
												? [...selected, o.value]
												: selected.filter((v) => v !== o.value),
										)
									}
								/>
								<Label htmlFor={`${id}-${o.value}`} className="font-normal">
									{localized(o.label)}
								</Label>
							</div>
						))}
					</div>
				</fieldset>
			);
			break;
		}
		case "long_text":
			control = (
				<>
					<Label htmlFor={id}>{label}</Label>
					<Textarea
						id={id}
						value={text}
						onChange={(e) => onChange(e.target.value)}
						maxLength={5000}
						rows={3}
						aria-invalid={Boolean(error)}
						aria-describedby={describedBy}
					/>
				</>
			);
			break;
		default: {
			const props: Record<string, string> =
				def.type === "date"
					? { type: "date" }
					: def.type === "email"
						? { type: "email", inputMode: "email" }
						: def.type === "phone"
							? { type: "tel", inputMode: "tel" }
							: def.type === "url"
								? { type: "url", inputMode: "url", placeholder: "https://" }
								: def.type === "number" ||
										def.type === "money" ||
										def.type === "percent"
									? { inputMode: "decimal" }
									: {};
			const suffix =
				def.type === "money" ? currency : def.type === "percent" ? "%" : "";
			control = (
				<>
					<Label htmlFor={id}>
						{label}
						{suffix ? (
							<span className="text-muted-foreground"> ({suffix})</span>
						) : null}
					</Label>
					<Input
						id={id}
						value={text}
						onChange={(e) => onChange(e.target.value)}
						maxLength={def.type === "url" ? 2048 : 255}
						aria-invalid={Boolean(error)}
						aria-describedby={describedBy}
						{...props}
					/>
				</>
			);
		}
	}
	return (
		<div className="space-y-2">
			{control}
			{help ? (
				<p id={`${id}-help`} className="text-xs text-muted-foreground">
					{help}
				</p>
			) : null}
			{error ? (
				<p id={`${id}-error`} role="alert" className="text-sm text-destructive">
					{error}
				</p>
			) : null}
		</div>
	);
}

// The custom fields of a record form, grouped in sections
export function CustomFieldInputs({
	fields,
	values,
	errors,
	onChange,
}: {
	fields: RecordFields;
	values: Record<string, FormValue>;
	errors: Record<string, string>;
	onChange: (key: string, value: FormValue) => void;
}) {
	return (
		<>
			{sectionsOf(fields).map((section) => (
				<fieldset key={section.id} className="space-y-3 border-t pt-4">
					<legend className="text-sm font-semibold">{section.label}</legend>
					<div className="grid gap-4 sm:grid-cols-2">
						{section.fields.map((def) => (
							<FieldInput
								key={def.key}
								def={def}
								value={values[def.key] ?? toFormValue(def, undefined)}
								onChange={(v) => onChange(def.key, v)}
								error={errors[def.key]}
								currency={fields.currency}
							/>
						))}
					</div>
				</fieldset>
			))}
		</>
	);
}

// Read-only values on a record page, one block per section
export function CustomFieldsView({
	fields,
	custom,
}: {
	fields: RecordFields;
	custom: Record<string, unknown>;
}) {
	const sections = sectionsOf(fields);
	if (!sections.length) return null;
	return (
		<div className="space-y-4">
			{sections.map((section) => (
				<div key={section.id} className="space-y-2 border-t pt-3">
					<p className="text-sm font-semibold">{section.label}</p>
					<dl className="space-y-2">
						{section.fields.map((def) => (
							<div key={def.key}>
								<dt className="text-xs text-muted-foreground">
									{localized(def.label)}
								</dt>
								<dd className="text-sm whitespace-pre-wrap break-words">
									{formatValue(
										def,
										Object.hasOwn(custom, def.key)
											? custom[def.key]
											: undefined,
										fields.currency,
									) || m.common_none()}
								</dd>
							</div>
						))}
					</dl>
				</div>
			))}
		</div>
	);
}

// "custom.membership_level" -> "Membership level", for timeline change events
export function customFieldLabels(fields: Pick<RecordFields, "fields">) {
	return Object.fromEntries(
		fields.fields.map((f) => [`custom.${f.key}`, localized(f.label)]),
	);
}
