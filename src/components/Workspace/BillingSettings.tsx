import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
	FieldError,
	FormAlert,
	fieldErrors,
} from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/Customers/CustomerFormDialog";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { updateBillingSettings } from "#/lib/billing";
import { CURRENCIES, type Currency } from "#/lib/money";
import { billingSettingsSchema } from "#/lib/schema";
import { m } from "#/paraglide/messages.js";

type Settings = {
	currency: string;
	defaultTaxRate: string;
	paymentTermsDays: number;
};

// Defaults for new orders and invoices. Existing documents keep their own
// currency and tax rate.
export function BillingSettings({
	settings,
	canEdit,
}: {
	settings: Settings;
	canEdit: boolean;
}) {
	const router = useRouter();
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const form = useForm({
		defaultValues: {
			currency: settings.currency as Currency,
			defaultTaxRate: settings.defaultTaxRate,
			paymentTermsDays: String(settings.paymentTermsDays),
		},
		onSubmit: async ({ value }) => {
			setStatus(null);
			const parsed = billingSettingsSchema.safeParse(value);
			if (!parsed.success) {
				setStatus({
					ok: false,
					message: parsed.error.issues[0]?.message ?? m.billing_check_values(),
				});
				return;
			}
			try {
				await updateBillingSettings({ data: parsed.data });
				setStatus({ ok: true, message: m.billing_saved() });
				await router.invalidate();
			} catch (e) {
				setStatus({ ok: false, message: await serverErrorMessage(e) });
			}
		},
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>{m.billing_title()}</CardTitle>
				<CardDescription>{m.billing_description()}</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					noValidate
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<FormAlert
						message={status?.message ?? null}
						variant={status?.ok ? "success" : "destructive"}
					/>
					<fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-3">
						<form.Field name="currency">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="billing-currency">
										{m.billing_currency()}
									</Label>
									<Select
										value={field.state.value}
										onValueChange={(v) => field.handleChange(v as Currency)}
										disabled={!canEdit}
									>
										<SelectTrigger id="billing-currency" className="w-full">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{CURRENCIES.map((c) => (
												<SelectItem key={c} value={c}>
													{c}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>
						<form.Field
							name="defaultTaxRate"
							validators={{
								onBlur: ({ value }) =>
									billingSettingsSchema.shape.defaultTaxRate.safeParse(value)
										.error?.issues[0]?.message,
							}}
						>
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="billing-tax">{m.billing_tax_rate()}</Label>
									<Input
										id="billing-tax"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										inputMode="decimal"
										maxLength={6}
										aria-invalid={fieldErrors(field.state.meta).length > 0}
										aria-describedby="billing-tax-error"
									/>
									<FieldError id="billing-tax-error" meta={field.state.meta} />
								</div>
							)}
						</form.Field>
						<form.Field
							name="paymentTermsDays"
							validators={{
								onBlur: ({ value }) =>
									billingSettingsSchema.shape.paymentTermsDays.safeParse(value)
										.error?.issues[0]?.message,
							}}
						>
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor="billing-terms">{m.billing_terms()}</Label>
									<Input
										id="billing-terms"
										type="number"
										min={0}
										max={365}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										aria-invalid={fieldErrors(field.state.meta).length > 0}
										aria-describedby="billing-terms-error"
									/>
									<FieldError
										id="billing-terms-error"
										meta={field.state.meta}
									/>
								</div>
							)}
						</form.Field>
					</fieldset>
					{canEdit ? (
						<form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
							{([canSubmit, isSubmitting]) => (
								<Button type="submit" disabled={!canSubmit || isSubmitting}>
									{isSubmitting ? m.common_saving() : m.billing_save()}
								</Button>
							)}
						</form.Subscribe>
					) : (
						<p className="text-sm text-muted-foreground">
							{m.billing_owner_only()}
						</p>
					)}
				</form>
			</CardContent>
		</Card>
	);
}
