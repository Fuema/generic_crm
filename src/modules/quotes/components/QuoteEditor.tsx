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
import { storedToDay } from "#/modules/deals/schema";
import {
	CustomFieldInputs,
	initialFormValues,
	toCustomInput,
} from "#/modules/fields/components/CustomFields";
import type { RecordFields } from "#/modules/fields/fields";
import type { FormValue } from "#/modules/fields/values";
import type { ProductOption } from "#/modules/products/products";
import { m } from "#/paraglide/messages.js";
import { type QuoteDetail, updateQuote } from "../quotes";
import { QUOTE_LIMITS, quoteTotals, updateQuoteSchema } from "../schema";

type LineDraft = {
	key: string;
	productId: string;
	description: string;
	sku: string;
	quantity: string;
	price: string;
};

let counter = 0;
const newKey = () => `l${++counter}`;

// Edits a draft quote: who it's for, its language, tax and validity, and its
// lines (from the catalog or free text). Totals are shown as you type; the
// server recomputes them on save.
export function QuoteEditor({
	detail,
	products,
	options,
	fields,
	onSaved,
}: {
	detail: QuoteDetail;
	products: ProductOption[];
	options: {
		members: { id: string; name: string }[];
		companies: { id: string; name: string }[];
	};
	fields: RecordFields;
	onSaved: () => Promise<void>;
}) {
	const q = detail.quote;
	const [contact, setContact] = useState({
		id: q.contactId,
		firstName: detail.contactFirstName ?? "",
		lastName: detail.contactLastName ?? null,
	} as { id: string; firstName: string; lastName: string | null } | null);
	const [companyId, setCompanyId] = useState(q.companyId ?? "");
	const [ownerId, setOwnerId] = useState(q.ownerId ?? "");
	const [locale, setLocale] = useState(q.locale === "es" ? "es" : "en");
	const [tax, setTax] = useState(bpToPercent(q.taxRateBp));
	const [validUntil, setValidUntil] = useState(storedToDay(q.validUntil));
	const [notes, setNotes] = useState(q.notes ?? "");
	const [lines, setLines] = useState<LineDraft[]>(
		detail.lines.map((l) => ({
			key: newKey(),
			productId: l.productId ?? "",
			description: l.description,
			sku: l.sku ?? "",
			quantity: String(l.quantity),
			price: centsToInput(l.unitPriceCents),
		})),
	);
	const [custom, setCustom] = useState<Record<string, FormValue>>(() =>
		initialFormValues(fields.fields, q.custom),
	);
	const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
	const [pick, setPick] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [saved, setSaved] = useState(false);

	const money = (cents: number) => formatMoney(cents, q.currency);
	const parsed = lines.map((l) => ({
		quantity: Number.parseInt(l.quantity, 10) || 0,
		unitPriceCents: parseMoneyToCents(l.price) ?? 0,
	}));
	const taxBp = parsePercentToBp(tax);
	const totals = quoteTotals(parsed, taxBp ?? 0);

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

	const addProduct = (id: string) => {
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
	};

	const save = async () => {
		setError(null);
		setSaved(false);
		if (taxBp === null) {
			setError(m.validation_tax_rate_format());
			return;
		}
		for (const l of lines) {
			if (parseMoneyToCents(l.price) === null) {
				setError(m.validation_price());
				return;
			}
		}
		const { input: customInput, errors: ce } = toCustomInput(
			fields.fields,
			custom,
		);
		setCustomErrors(ce);
		if (Object.keys(ce).length) return;
		const result = updateQuoteSchema.safeParse({
			id: q.id,
			contactId: contact?.id ?? "",
			companyId,
			ownerId,
			locale,
			taxRateBp: taxBp,
			validUntil,
			notes,
			lines: lines.map((l, i) => ({
				productId: l.productId,
				description: l.description,
				sku: l.sku,
				quantity: parsed[i].quantity,
				unitPriceCents: parsed[i].unitPriceCents,
			})),
			custom: customInput,
		});
		if (!result.success) {
			setError(result.error.issues[0]?.message ?? m.error_generic());
			return;
		}
		if (totals.problem) {
			setError(totals.problem);
			return;
		}
		setBusy(true);
		try {
			await updateQuote({ data: result.data });
			setSaved(true);
			await onSaved();
		} catch (e) {
			setError(await serverErrorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card className="print:hidden">
			<CardHeader>
				<CardTitle>{m.quote_edit_title()}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<FormAlert message={error} />
				{saved ? (
					<FormAlert variant="success" message={m.quote_saved()} />
				) : null}
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="quote-contact">{m.deal_contact()}</Label>
						<ContactPicker
							id="quote-contact"
							value={contact}
							invalid={!contact}
							onChange={(c) => {
								setContact(c);
								if (c?.companyId && !companyId) setCompanyId(c.companyId);
							}}
						/>
					</div>
					<OptionSelect
						id="quote-company"
						label={m.contact_company()}
						value={companyId}
						emptyLabel={m.common_none()}
						onChange={setCompanyId}
						options={options.companies.map((c) => ({
							value: c.id,
							label: c.name,
						}))}
					/>
					<OptionSelect
						id="quote-owner"
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
						id="quote-locale"
						label={m.quote_language()}
						value={locale}
						onChange={(v) => setLocale(v === "es" ? "es" : "en")}
						options={[
							{ value: "en", label: m.language_en() },
							{ value: "es", label: m.language_es() },
						]}
					/>
					<div className="space-y-2">
						<Label htmlFor="quote-tax">{m.quote_tax_rate()}</Label>
						<Input
							id="quote-tax"
							inputMode="decimal"
							value={tax}
							aria-invalid={taxBp === null || undefined}
							onChange={(e) => setTax(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="quote-valid">{m.quote_valid_until()}</Label>
						<Input
							id="quote-valid"
							type="date"
							value={validUntil}
							onChange={(e) => setValidUntil(e.target.value)}
						/>
						<p className="text-xs text-muted-foreground">
							{m.quote_valid_until_help({ days: QUOTE_LIMITS.validDays })}
						</p>
					</div>
				</div>

				<fieldset className="space-y-3">
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
								id="quote-add-product"
								label={m.quote_add_product()}
								value={pick}
								emptyLabel={m.quote_choose_product()}
								onChange={addProduct}
								options={products.map((p) => ({
									value: p.id,
									label: `${p.name} · ${p.sku} · ${money(p.unitPriceCents)}`,
								}))}
							/>
						</div>
						<Button
							type="button"
							variant="outline"
							disabled={lines.length >= QUOTE_LIMITS.linesPerQuote}
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
					<Label htmlFor="quote-notes">{m.quote_notes()}</Label>
					<Textarea
						id="quote-notes"
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
