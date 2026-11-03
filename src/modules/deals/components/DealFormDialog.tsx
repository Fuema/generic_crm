import { useEffect, useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
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
import { Textarea } from "#/components/ui/textarea";
import { centsToInput, parseMoneyToCents } from "#/lib/money";
import { OptionSelect } from "#/modules/contacts/components/fields";
import { contactName } from "#/modules/contacts/schema";
import {
	CustomFieldInputs,
	initialFormValues,
	toCustomInput,
} from "#/modules/fields/components/CustomFields";
import type { RecordFields } from "#/modules/fields/fields";
import { localized } from "#/modules/fields/schema";
import type { FormValue } from "#/modules/fields/values";
import type { Pipelines } from "#/modules/pipelines/pipelines";
import { m } from "#/paraglide/messages.js";
import { searchDealContacts } from "../deals";
import {
	type DealInput,
	dealInputSchema,
	lostReasonProblem,
	MAX_DEAL_CENTS,
} from "../schema";

export type ContactChoice = {
	id: string;
	firstName: string;
	lastName: string | null;
	companyId?: string | null;
};

type Options = {
	pipelines: Pipelines;
	members: { id: string; name: string }[];
	companies: { id: string; name: string }[];
};

// A blank deal in the first active pipeline's first stage
export function emptyDeal(
	pipelines: Pipelines,
	contact?: ContactChoice | null,
	companyId = "",
): DealInput {
	const p = pipelines.find((x) => !x.archivedAt) ?? pipelines[0];
	return {
		name: "",
		pipelineId: p?.id ?? "",
		stageId: p?.stages.find((s) => s.type === "open")?.id ?? "",
		valueCents: 0,
		expectedClose: "",
		contactId: contact?.id ?? "",
		companyId: companyId || (contact?.companyId ?? ""),
		ownerId: "",
		lostReason: "",
	};
}

// Search box over the workspace's active contacts; one is chosen
function ContactPicker({
	id,
	value,
	onChange,
	invalid,
}: {
	id: string;
	value: ContactChoice | null;
	onChange: (c: ContactChoice | null) => void;
	invalid: boolean;
}) {
	const [q, setQ] = useState("");
	const [rows, setRows] = useState<ContactChoice[]>([]);
	const [searching, setSearching] = useState(false);

	useEffect(() => {
		if (value) return;
		let cancelled = false;
		const timer = setTimeout(async () => {
			setSearching(true);
			try {
				const found = await searchDealContacts({ data: { q } });
				if (!cancelled) setRows(found);
			} finally {
				if (!cancelled) setSearching(false);
			}
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [q, value]);

	if (value)
		return (
			<div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
				<span id={id} className="text-sm font-medium">
					{contactName(value)}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => onChange(null)}
				>
					{m.deal_contact_change()}
				</Button>
			</div>
		);
	return (
		<div className="space-y-2">
			<Input
				id={id}
				type="search"
				value={q}
				aria-invalid={invalid || undefined}
				placeholder={m.deal_contact_search()}
				onChange={(e) => setQ(e.target.value)}
			/>
			<ul className="max-h-40 divide-y overflow-y-auto rounded-md border">
				{rows.map((c) => (
					<li key={c.id}>
						<button
							type="button"
							className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
							onClick={() => onChange(c)}
						>
							{contactName(c)}
						</button>
					</li>
				))}
				{!rows.length && !searching ? (
					<li className="px-3 py-1.5 text-sm text-muted-foreground">
						{m.merge_no_results()}
					</li>
				) : null}
			</ul>
		</div>
	);
}

export function DealFormDialog({
	open,
	onOpenChange,
	initial,
	initialContact,
	initialCustom,
	editing,
	fields,
	options,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initial: DealInput;
	initialContact: ContactChoice | null;
	initialCustom: Record<string, unknown>;
	editing: boolean;
	fields: RecordFields;
	options: Options;
	onSave: (value: DealInput) => Promise<void>;
}) {
	const [value, setValue] = useState(initial);
	const [amount, setAmount] = useState(
		initial.valueCents ? centsToInput(initial.valueCents) : "",
	);
	const [contact, setContact] = useState(initialContact);
	const [custom, setCustom] = useState<Record<string, FormValue>>(() =>
		initialFormValues(fields.fields, initialCustom),
	);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const pipeline = options.pipelines.find((p) => p.id === value.pipelineId);
	const stage = pipeline?.stages.find((s) => s.id === value.stageId);
	const patch = (p: Partial<DealInput>) => setValue((v) => ({ ...v, ...p }));

	const submit = async () => {
		setError(null);
		const cents = amount.trim() === "" ? 0 : parseMoneyToCents(amount);
		const next: Record<string, string> = {};
		if (cents === null || cents > MAX_DEAL_CENTS)
			next.value = m.validation_deal_value();
		const parsed = dealInputSchema.safeParse({
			...value,
			valueCents: cents ?? 0,
			contactId: contact?.id ?? "",
		});
		if (!parsed.success)
			for (const issue of parsed.error.issues) {
				const key = String(issue.path[0] ?? "form");
				next[key] ??= issue.message;
			}
		const reason = lostReasonProblem(stage?.type ?? "open", value.lostReason);
		if (reason) next.lostReason = reason;
		const { input, errors: ce } = toCustomInput(fields.fields, custom);
		setErrors(next);
		setCustomErrors(ce);
		if (Object.keys(next).length || Object.keys(ce).length || !parsed.success)
			return;
		setBusy(true);
		try {
			await onSave({ ...parsed.data, custom: input });
		} catch (e) {
			setError(await serverErrorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	const fieldError = (key: string) =>
		errors[key] ? (
			<p
				id={`deal-${key}-error`}
				role="alert"
				className="text-sm font-medium text-destructive"
			>
				{errors[key]}
			</p>
		) : null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{editing ? m.deal_edit_title() : m.deal_new_title()}
					</DialogTitle>
					<DialogDescription>{m.deal_form_description()}</DialogDescription>
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
					<div className="space-y-2">
						<Label htmlFor="deal-name">{m.deal_name()}</Label>
						<Input
							id="deal-name"
							value={value.name}
							maxLength={120}
							aria-invalid={Boolean(errors.name) || undefined}
							aria-describedby={errors.name ? "deal-name-error" : undefined}
							onChange={(e) => patch({ name: e.target.value })}
						/>
						{fieldError("name")}
					</div>
					<div className="space-y-2">
						<Label htmlFor="deal-contact">{m.deal_contact()}</Label>
						<ContactPicker
							id="deal-contact"
							value={contact}
							invalid={Boolean(errors.contactId)}
							onChange={(c) => {
								setContact(c);
								if (c?.companyId && !value.companyId)
									patch({ companyId: c.companyId });
							}}
						/>
						{fieldError("contactId")}
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<OptionSelect
							id="deal-company"
							label={m.contact_company()}
							value={value.companyId}
							emptyLabel={m.common_none()}
							onChange={(v) => patch({ companyId: v })}
							options={options.companies.map((c) => ({
								value: c.id,
								label: c.name,
							}))}
						/>
						<OptionSelect
							id="deal-owner"
							label={m.common_owner()}
							value={value.ownerId}
							emptyLabel={m.common_none()}
							onChange={(v) => patch({ ownerId: v })}
							options={options.members.map((u) => ({
								value: u.id,
								label: u.name,
							}))}
						/>
						<OptionSelect
							id="deal-pipeline"
							label={m.deal_pipeline()}
							value={value.pipelineId}
							onChange={(v) => {
								const p = options.pipelines.find((x) => x.id === v);
								patch({
									pipelineId: v,
									stageId: p?.stages.find((s) => s.type === "open")?.id ?? "",
								});
							}}
							options={options.pipelines
								.filter((p) => !p.archivedAt || p.id === value.pipelineId)
								.map((p) => ({ value: p.id, label: localized(p.name) }))}
						/>
						<OptionSelect
							id="deal-stage"
							label={m.deal_stage()}
							value={value.stageId}
							onChange={(v) => patch({ stageId: v })}
							options={(pipeline?.stages ?? []).map((s) => ({
								value: s.id,
								label: localized(s.name),
							}))}
						/>
						<div className="space-y-2">
							<Label htmlFor="deal-value">
								{m.deal_value({ currency: fields.currency })}
							</Label>
							<Input
								id="deal-value"
								inputMode="decimal"
								value={amount}
								placeholder="0.00"
								aria-invalid={Boolean(errors.value) || undefined}
								aria-describedby={errors.value ? "deal-value-error" : undefined}
								onChange={(e) => setAmount(e.target.value)}
							/>
							{fieldError("value")}
						</div>
						<div className="space-y-2">
							<Label htmlFor="deal-close">{m.deal_expected_close()}</Label>
							<Input
								id="deal-close"
								type="date"
								value={value.expectedClose}
								aria-invalid={Boolean(errors.expectedClose) || undefined}
								onChange={(e) => patch({ expectedClose: e.target.value })}
							/>
							{fieldError("expectedClose")}
						</div>
					</div>
					{stage?.type === "lost" ? (
						<div className="space-y-2">
							<Label htmlFor="deal-lost-reason">{m.deal_lost_reason()}</Label>
							<Textarea
								id="deal-lost-reason"
								value={value.lostReason}
								maxLength={500}
								aria-invalid={Boolean(errors.lostReason) || undefined}
								aria-describedby={
									errors.lostReason ? "deal-lostReason-error" : undefined
								}
								onChange={(e) => patch({ lostReason: e.target.value })}
							/>
							{fieldError("lostReason")}
						</div>
					) : null}
					<CustomFieldInputs
						fields={fields}
						values={custom}
						errors={customErrors}
						onChange={(key, v) => setCustom((c) => ({ ...c, [key]: v }))}
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
								: editing
									? m.common_save_changes()
									: m.deal_create()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
