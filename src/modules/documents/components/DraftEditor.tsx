import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import {
	bpToPercent,
	centsToInput,
	formatMoney,
	parseMoneyToCents,
	parsePercentToBp,
} from "#/lib/money";
import { OptionSelect } from "#/modules/contacts/components/fields";
import { ContactPicker } from "#/modules/deals/components/DealFormDialog";
import {
	CustomFieldInputs,
	initialFormValues,
	toCustomInput,
} from "#/modules/fields/components/CustomFields";
import type { RecordFields } from "#/modules/fields/fields";
import type { FormValue } from "#/modules/fields/values";
import type { ProductOption } from "#/modules/products/products";
import { m } from "#/paraglide/messages.js";
import {
	DOCUMENT_LIMITS,
	type DocumentLine,
	type DocumentLineInput,
	documentTotals,
} from "../lines";

type LineDraft = {
	key: string;
	productId: string;
	description: string;
	sku: string;
	quantity: string;
	price: string;
};

export type DraftValues = {
	contactId: string;
	companyId: string;
	ownerId: string;
	locale: "en" | "es";
	taxRateBp: number;
	date: string;
	notes: string;
	lines: DocumentLineInput[];
	custom: Record<string, unknown>;
};

let counter = 0;
const newKey = () => `d${++counter}`;

// Edits a draft order or invoice: who it's for, its language, tax, an optional
// date, notes and its lines (catalog or free text). Totals show as you type;
// the server recomputes them on save.
export function DraftEditor({
	title,
	draft,
	lines: initialLines,
	date,
	products,
	options,
	fields,
	onSave,
	locked = false,
}: {
	title: string;
	draft: {
		contactId: string;
		contactName: string;
		companyId: string | null;
		ownerId: string | null;
		locale: string;
		taxRateBp: number;
		notes: string | null;
		currency: string;
		custom: Record<string, unknown>;
	};
	lines: DocumentLine[];
	// A date the document carries (the order date), as "YYYY-MM-DD"
	date?: { label: string; value: string };
	products: ProductOption[];
	options: {
		members: { id: string; name: string }[];
		companies: { id: string; name: string }[];
	};
	fields: RecordFields;
	onSave: (values: DraftValues) => Promise<void>;
	// A draft that comes from an order: its contact, company, tax and lines are
	// the order's and show read-only
	locked?: boolean;
}) {
	const [contact, setContact] = useState<{
		id: string;
		firstName: string;
		lastName: string | null;
		companyId?: string | null;
	} | null>({
		id: draft.contactId,
		firstName: draft.contactName,
		lastName: null,
	});
	const [companyId, setCompanyId] = useState(draft.companyId ?? "");
	const [ownerId, setOwnerId] = useState(draft.ownerId ?? "");
	const [locale, setLocale] = useState<"en" | "es">(
		draft.locale === "es" ? "es" : "en",
	);
	const [tax, setTax] = useState(bpToPercent(draft.taxRateBp));
	const [day, setDay] = useState(date?.value ?? "");
	const [notes, setNotes] = useState(draft.notes ?? "");
	const [lines, setLines] = useState<LineDraft[]>(
		initialLines.map((l) => ({
			key: newKey(),
			productId: l.productId ?? "",
			description: l.description,
			sku: l.sku ?? "",
			quantity: String(l.quantity),
			price: centsToInput(l.unitPriceCents),
		})),
	);
	const [custom, setCustom] = useState<Record<string, FormValue>>(() =>
		initialFormValues(fields.fields, draft.custom),
	);
	const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
	const [pick, setPick] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [saved, setSaved] = useState(false);

	const money = (cents: number) => formatMoney(cents, draft.currency);
	const parsed = lines.map((l) => ({
		quantity: Number.parseInt(l.quantity, 10) || 0,
		unitPriceCents: parseMoneyToCents(l.price) ?? 0,
	}));
	const taxBp = parsePercentToBp(tax);
	const totals = documentTotals(parsed, taxBp ?? 0);

	const patchLine = (key: string, value: Partial<LineDraft>) => {
		setSaved(false);
		setLines((list) =>
			list.map((l) => (l.key === key ? { ...l, ...value } : l)),
		);
	};
	const move = (i: number, delta: -1 | 1) =>
		setLines((list) => {
			const next = [...list];
			const j = i + delta;
			if (j < 0 || j >= next.length) return list;
			[next[i], next[j]] = [next[j], next[i]];
			return next;
		});

	const save = async () => {
		setError(null);
		setSaved(false);
		if (!contact) {
			setError(m.validation_deal_contact_required());
			return;
		}
		if (taxBp === null) {
			setError(m.validation_tax_rate_format());
			return;
		}
		if (lines.some((l) => parseMoneyToCents(l.price) === null)) {
			setError(m.validation_price());
			return;
		}
		if (totals.problem) {
			setError(totals.problem);
			return;
		}
		const { input, errors } = toCustomInput(fields.fields, custom);
		setCustomErrors(errors);
		if (Object.keys(errors).length) return;
		setBusy(true);
		try {
			await onSave({
				contactId: contact.id,
				companyId,
				ownerId,
				locale,
				taxRateBp: taxBp,
				date: day,
				notes,
				lines: lines.map((l, i) => ({
					productId: l.productId,
					description: l.description,
					sku: l.sku,
					quantity: parsed[i].quantity,
					unitPriceCents: parsed[i].unitPriceCents,
				})),
				custom: input,
			});
			setSaved(true);
		} catch (e) {
			setError(await serverErrorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card className="print:hidden">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<FormAlert message={error} />
				{saved ? (
					<FormAlert variant="success" message={m.quote_saved()} />
				) : null}
				<div className="grid gap-4 md:grid-cols-2">
					{locked ? (
						<p className="text-sm text-muted-foreground md:col-span-2">
							{m.document_locked_to_order({ name: draft.contactName })}
						</p>
					) : (
						<>
							<div className="space-y-2">
								<Label htmlFor="draft-contact">{m.deal_contact()}</Label>
								<ContactPicker
									id="draft-contact"
									value={contact}
									invalid={!contact}
									onChange={(c) => {
										setContact(c);
										if (c?.companyId && !companyId) setCompanyId(c.companyId);
									}}
								/>
							</div>
							<OptionSelect
								id="draft-company"
								label={m.contact_company()}
								value={companyId}
								emptyLabel={m.common_none()}
								onChange={setCompanyId}
								options={options.companies.map((c) => ({
									value: c.id,
									label: c.name,
								}))}
							/>
						</>
					)}
					<OptionSelect
						id="draft-owner"
						label={m.common_owner()}
						value={ownerId}
						emptyLabel={m.common_none()}
						onChange={setOwnerId}
						options={options.members.map((u) => ({
							value: u.id,
							label: u.name,
						}))}
					/>
					<OptionSelect
						id="draft-locale"
						label={m.document_language()}
						value={locale}
						onChange={(v) => setLocale(v === "es" ? "es" : "en")}
						options={[
							{ value: "en", label: m.language_en() },
							{ value: "es", label: m.language_es() },
						]}
					/>
					<div className="space-y-2">
						<Label htmlFor="draft-tax">{m.quote_tax_rate()}</Label>
						<Input
							id="draft-tax"
							inputMode="decimal"
							disabled={locked}
							value={tax}
							aria-invalid={taxBp === null || undefined}
							onChange={(e) => setTax(e.target.value)}
						/>
					</div>
					{date ? (
						<div className="space-y-2">
							<Label htmlFor="draft-date">{date.label}</Label>
							<Input
								id="draft-date"
								type="date"
								value={day}
								onChange={(e) => setDay(e.target.value)}
							/>
						</div>
					) : null}
				</div>

				<fieldset className="space-y-3" disabled={locked} hidden={locked}>
					<legend className="text-sm font-semibold">{m.quote_lines()}</legend>
					<ol className="space-y-3">
						{lines.map((l, i) => (
							<li key={l.key} className="space-y-2 rounded-md border p-3">
								<div className="flex items-center justify-between gap-2">
									<span className="text-xs text-muted-foreground">
										{l.productId ? m.quote_line_catalog() : m.quote_line_free()}
									</span>
									<div className="flex gap-1">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={m.quote_line_up()}
											disabled={i === 0}
											onClick={() => move(i, -1)}
										>
											<ArrowUp />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={m.quote_line_down()}
											disabled={i === lines.length - 1}
											onClick={() => move(i, 1)}
										>
											<ArrowDown />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											aria-label={m.quote_line_remove()}
											onClick={() =>
												setLines((list) => list.filter((x) => x.key !== l.key))
											}
										>
											<Trash2 />
										</Button>
									</div>
								</div>
								<div className="grid gap-3 md:grid-cols-6">
									<div className="space-y-1 md:col-span-3">
										<Label htmlFor={`${l.key}-description`}>
											{m.quote_col_description()}
										</Label>
										<Textarea
											id={`${l.key}-description`}
											rows={1}
											value={l.description}
											maxLength={500}
											onChange={(e) =>
												patchLine(l.key, { description: e.target.value })
											}
										/>
									</div>
									<div className="space-y-1">
										<Label htmlFor={`${l.key}-quantity`}>
											{m.quote_col_quantity()}
										</Label>
										<Input
											id={`${l.key}-quantity`}
											inputMode="numeric"
											value={l.quantity}
											onChange={(e) =>
												patchLine(l.key, { quantity: e.target.value })
											}
										/>
									</div>
									<div className="space-y-1">
										<Label htmlFor={`${l.key}-price`}>
											{m.quote_col_unit_price()}
										</Label>
										<Input
											id={`${l.key}-price`}
											inputMode="decimal"
											value={l.price}
											aria-invalid={
												parseMoneyToCents(l.price) === null || undefined
											}
											onChange={(e) =>
												patchLine(l.key, { price: e.target.value })
											}
										/>
									</div>
									<div className="space-y-1">
										<p className="text-sm font-medium">
											{m.quote_col_amount()}
										</p>
										<p className="py-2 text-sm tabular-nums">
											{money(totals.lineTotals[i] ?? 0)}
										</p>
									</div>
								</div>
							</li>
						))}
					</ol>
					<div className="flex flex-wrap items-end gap-3">
						<div className="min-w-56 flex-1">
							<OptionSelect
								id="draft-add-product"
								label={m.quote_add_product()}
								value={pick}
								emptyLabel={m.quote_choose_product()}
								onChange={(id) => {
									const p = products.find((x) => x.id === id);
									if (!p) return;
									setLines((list) => [
										...list,
										{
											key: newKey(),
											productId: p.id,
											description: p.name,
											sku: p.sku,
											quantity: "1",
											price: centsToInput(p.unitPriceCents),
										},
									]);
									setPick("");
								}}
								options={products.map((p) => ({
									value: p.id,
									label: `${p.name} · ${p.sku} · ${money(p.unitPriceCents)}`,
								}))}
							/>
						</div>
						<Button
							type="button"
							variant="outline"
							disabled={lines.length >= DOCUMENT_LIMITS.linesPerDocument}
							onClick={() =>
								setLines((list) => [
									...list,
									{
										key: newKey(),
										productId: "",
										description: "",
										sku: "",
										quantity: "1",
										price: "0.00",
									},
								])
							}
						>
							<Plus /> {m.quote_add_free_line()}
						</Button>
					</div>
				</fieldset>

				<dl className="ml-auto max-w-xs space-y-1 text-sm">
					<div className="flex justify-between">
						<dt className="text-muted-foreground">{m.quote_subtotal()}</dt>
						<dd className="tabular-nums">{money(totals.subtotalCents)}</dd>
					</div>
					<div className="flex justify-between">
						<dt className="text-muted-foreground">
							{m.quote_tax({ rate: taxBp === null ? "—" : bpToPercent(taxBp) })}
						</dt>
						<dd className="tabular-nums">{money(totals.taxCents)}</dd>
					</div>
					<div className="flex justify-between font-semibold">
						<dt>{m.quote_total()}</dt>
						<dd className="tabular-nums">{money(totals.totalCents)}</dd>
					</div>
				</dl>

				<div className="space-y-2">
					<Label htmlFor="draft-notes">{m.quote_notes()}</Label>
					<Textarea
						id="draft-notes"
						value={notes}
						maxLength={2000}
						onChange={(e) => setNotes(e.target.value)}
					/>
				</div>

				<CustomFieldInputs
					fields={fields}
					values={custom}
					errors={customErrors}
					onChange={(key, v) => setCustom((c) => ({ ...c, [key]: v }))}
				/>

				<div className="flex justify-end">
					<Button type="button" disabled={busy} onClick={save}>
						{busy ? m.common_saving() : m.quote_save()}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
