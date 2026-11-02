import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import {
	FieldError,
	FormAlert,
	fieldErrors,
} from "#/components/Auth/FormParts";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { COUNTRY_OPTIONS } from "#/lib/countries";
import type { CustomerRow } from "#/lib/customers";
import {
	CUSTOMER_STATUSES,
	type CustomerInput,
	type CustomerStatus,
	customerInputSchema,
} from "#/lib/schema";
import { STATUS_LABELS } from "./CustomerStatusBadge";

const NO_COUNTRY = "__none__";

const EMPTY: CustomerInput = {
	name: "",
	email: "",
	phone: "",
	company: "",
	status: "lead",
	city: "",
	country: "",
	notes: "",
};

function fromRow(row: CustomerRow): CustomerInput {
	return {
		name: row.name,
		email: row.email,
		phone: row.phone ?? "",
		company: row.company ?? "",
		status: (CUSTOMER_STATUSES as readonly string[]).includes(row.status)
			? (row.status as CustomerStatus)
			: "lead",
		city: row.city ?? "",
		country: row.country ?? "",
		notes: row.notes ?? "",
	};
}

// Turns a thrown server-function Response (401/403/404/409) or Error into text
export async function serverErrorMessage(error: unknown) {
	if (error instanceof Response) {
		if (error.status === 401)
			return "Your session has expired. Please sign in again.";
		if (error.status === 403)
			return "Your role in this workspace doesn't allow that.";
		const text = await error.text().catch(() => "");
		return text || `Request failed (${error.status}).`;
	}
	return error instanceof Error
		? error.message
		: "Something went wrong. Please try again.";
}

type TextField = "name" | "email" | "phone" | "company" | "city";

const TEXT_FIELDS: {
	name: TextField;
	label: string;
	type?: string;
	autoComplete: string;
	maxLength: number;
	placeholder?: string;
	required?: boolean;
}[] = [
	{
		name: "name",
		label: "Name",
		autoComplete: "off",
		maxLength: 100,
		required: true,
	},
	{
		name: "email",
		label: "Email",
		type: "email",
		autoComplete: "off",
		maxLength: 254,
		placeholder: "name@company.com",
		required: true,
	},
	{
		name: "phone",
		label: "Phone",
		type: "tel",
		autoComplete: "off",
		maxLength: 25,
		placeholder: "+1 555 123 4567",
	},
	{ name: "company", label: "Company", autoComplete: "off", maxLength: 100 },
	{ name: "city", label: "City", autoComplete: "off", maxLength: 100 },
];

export function CustomerFormDialog({
	open,
	onOpenChange,
	customer,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// null = create a new customer
	customer: CustomerRow | null;
	onSave: (value: CustomerInput) => Promise<void>;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{customer ? "Edit customer" : "New customer"}
					</DialogTitle>
					<DialogDescription>
						Fields marked * are required. The email must be unique in this
						workspace.
					</DialogDescription>
				</DialogHeader>
				{/* Remount per customer so the form starts from that customer's values */}
				<CustomerForm
					key={customer?.id ?? "new"}
					initial={customer ? fromRow(customer) : EMPTY}
					submitLabel={customer ? "Save changes" : "Create customer"}
					onSave={onSave}
					onCancel={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}

function CustomerForm({
	initial,
	submitLabel,
	onSave,
	onCancel,
}: {
	initial: CustomerInput;
	submitLabel: string;
	onSave: (value: CustomerInput) => Promise<void>;
	onCancel: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: initial,
		validators: { onBlur: customerInputSchema, onSubmit: customerInputSchema },
		onSubmit: async ({ value }) => {
			setError(null);
			try {
				await onSave(customerInputSchema.parse(value));
			} catch (e) {
				setError(await serverErrorMessage(e));
			}
		},
	});

	return (
		<form
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-4"
		>
			<FormAlert message={error} />
			<div className="grid gap-4 sm:grid-cols-2">
				{TEXT_FIELDS.map((f) => (
					<form.Field key={f.name} name={f.name}>
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={`customer-${f.name}`}>
									{f.label}
									{f.required ? " *" : ""}
								</Label>
								<Input
									id={`customer-${f.name}`}
									type={f.type ?? "text"}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									autoComplete={f.autoComplete}
									maxLength={f.maxLength}
									placeholder={f.placeholder}
									aria-required={f.required}
									aria-invalid={fieldErrors(field.state.meta).length > 0}
									aria-describedby={`customer-${f.name}-error`}
								/>
								<FieldError
									id={`customer-${f.name}-error`}
									meta={field.state.meta}
								/>
							</div>
						)}
					</form.Field>
				))}

				<form.Field name="country">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor="customer-country">Country</Label>
							<Select
								value={field.state.value || NO_COUNTRY}
								onValueChange={(v) => {
									field.handleChange(v === NO_COUNTRY ? "" : v);
									field.handleBlur();
								}}
							>
								<SelectTrigger id="customer-country" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="max-h-72">
									<SelectItem value={NO_COUNTRY}>No country</SelectItem>
									{COUNTRY_OPTIONS.map((c) => (
										<SelectItem key={c.code} value={c.code}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<FieldError id="customer-country-error" meta={field.state.meta} />
						</div>
					)}
				</form.Field>

				<form.Field name="status">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor="customer-status">Status *</Label>
							<Select
								value={field.state.value}
								onValueChange={(v) => field.handleChange(v as CustomerStatus)}
							>
								<SelectTrigger id="customer-status" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CUSTOMER_STATUSES.map((s) => (
										<SelectItem key={s} value={s}>
											{STATUS_LABELS[s]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</form.Field>
			</div>

			<form.Field name="notes">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor="customer-notes">Notes</Label>
						<Textarea
							id="customer-notes"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							maxLength={2000}
							rows={3}
							aria-invalid={fieldErrors(field.state.meta).length > 0}
							aria-describedby="customer-notes-error"
						/>
						<p className="text-right text-xs text-muted-foreground">
							{field.state.value.length}/2000
						</p>
						<FieldError id="customer-notes-error" meta={field.state.meta} />
					</div>
				)}
			</form.Field>

			<DialogFooter>
				<Button type="button" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
					{([canSubmit, isSubmitting]) => (
						<Button type="submit" disabled={!canSubmit || isSubmitting}>
							{isSubmitting ? "Saving..." : submitLabel}
						</Button>
					)}
				</form.Subscribe>
			</DialogFooter>
		</form>
	);
}
