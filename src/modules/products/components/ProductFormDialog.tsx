import { useState } from "react";
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
import {
	CustomFieldInputs,
	initialFormValues,
	toCustomInput,
} from "#/modules/fields/components/CustomFields";
import type { RecordFields } from "#/modules/fields/fields";
import type { FormValue } from "#/modules/fields/values";
import { m } from "#/paraglide/messages.js";
import {
	MAX_PRICE_CENTS,
	type ProductInput,
	productInputSchema,
} from "../schema";

export const EMPTY_PRODUCT: ProductInput = {
	name: "",
	sku: "",
	description: "",
	unitPriceCents: 0,
};

export function ProductFormDialog({
	open,
	onOpenChange,
	initial,
	initialCustom,
	editing,
	fields,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initial: ProductInput;
	initialCustom: Record<string, unknown>;
	editing: boolean;
	fields: RecordFields;
	onSave: (value: ProductInput) => Promise<void>;
}) {
	const [value, setValue] = useState(initial);
	const [price, setPrice] = useState(
		editing ? centsToInput(initial.unitPriceCents) : "",
	);
	const [custom, setCustom] = useState<Record<string, FormValue>>(() =>
		initialFormValues(fields.fields, initialCustom),
	);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const patch = (p: Partial<ProductInput>) => setValue((v) => ({ ...v, ...p }));

	const submit = async () => {
		setError(null);
		const cents = parseMoneyToCents(price);
		const next: Record<string, string> = {};
		if (cents === null || cents > MAX_PRICE_CENTS)
			next.unitPriceCents = m.validation_price();
		const parsed = productInputSchema.safeParse({
			...value,
			unitPriceCents: cents ?? 0,
		});
		if (!parsed.success)
			for (const issue of parsed.error.issues) {
				const key = String(issue.path[0] ?? "form");
				next[key] ??= issue.message;
			}
		const { input, errors: ce } = toCustomInput(fields.fields, custom);
		setErrors(next);
		setCustomErrors(ce);
		if (!parsed.success || Object.keys(next).length || Object.keys(ce).length)
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

	const described = (key: string) =>
		errors[key] ? `product-${key}-error` : undefined;
	const fieldError = (key: string) =>
		errors[key] ? (
			<p
				id={`product-${key}-error`}
				role="alert"
				className="text-sm font-medium text-destructive"
			>
				{errors[key]}
			</p>
		) : null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{editing ? m.product_edit_title() : m.product_new_title()}
					</DialogTitle>
					<DialogDescription>{m.product_form_description()}</DialogDescription>
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
						<Label htmlFor="product-name">{m.product_name()}</Label>
						<Input
							id="product-name"
							value={value.name}
							maxLength={100}
							aria-invalid={Boolean(errors.name) || undefined}
							aria-describedby={described("name")}
							onChange={(e) => patch({ name: e.target.value })}
						/>
						{fieldError("name")}
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="product-sku">{m.product_sku()}</Label>
							<Input
								id="product-sku"
								value={value.sku}
								maxLength={32}
								autoCapitalize="characters"
								aria-invalid={Boolean(errors.sku) || undefined}
								aria-describedby={described("sku")}
								onChange={(e) => patch({ sku: e.target.value })}
							/>
							{fieldError("sku")}
						</div>
						<div className="space-y-2">
							<Label htmlFor="product-price">
								{m.product_price({ currency: fields.currency })}
							</Label>
							<Input
								id="product-price"
								inputMode="decimal"
								value={price}
								placeholder="0.00"
								aria-invalid={Boolean(errors.unitPriceCents) || undefined}
								aria-describedby={described("unitPriceCents")}
								onChange={(e) => setPrice(e.target.value)}
							/>
							{fieldError("unitPriceCents")}
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="product-description">
							{m.product_description()}
						</Label>
						<Textarea
							id="product-description"
							value={value.description}
							maxLength={500}
							aria-invalid={Boolean(errors.description) || undefined}
							aria-describedby={described("description")}
							onChange={(e) => patch({ description: e.target.value })}
						/>
						{fieldError("description")}
					</div>
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
									: m.product_create()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
