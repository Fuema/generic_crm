import { useForm } from "@tanstack/react-form";
import { useMemo, useState } from "react";
import {
	FieldError,
	FormAlert,
	fieldErrors,
} from "#/components/Auth/FormParts";
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
import { countryOptions } from "#/lib/countries";
import { m } from "#/paraglide/messages.js";
import { type CompanyInput, companyInputSchema } from "../schema";
import { OptionSelect } from "./fields";

export const EMPTY_COMPANY: CompanyInput = {
	name: "",
	domain: "",
	phone: "",
	city: "",
	country: "",
	ownerId: "",
};

const TEXT_FIELDS = [
	{
		name: "name",
		label: m.company_name,
		autoComplete: "organization",
		maxLength: 100,
	},
	{
		name: "domain",
		label: m.company_domain,
		autoComplete: "off",
		maxLength: 253,
		placeholder: m.company_domain_placeholder,
	},
	{
		name: "phone",
		label: m.common_phone,
		autoComplete: "tel",
		maxLength: 25,
		type: "tel",
	},
	{
		name: "city",
		label: m.common_city,
		autoComplete: "address-level2",
		maxLength: 100,
	},
] as const;

export function CompanyFormDialog({
	open,
	onOpenChange,
	initial,
	editing,
	members,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initial: CompanyInput;
	editing: boolean;
	members: { id: string; name: string }[];
	onSave: (value: CompanyInput) => Promise<void>;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{editing ? m.company_edit_title() : m.company_new_title()}
					</DialogTitle>
					<DialogDescription>{m.company_form_description()}</DialogDescription>
				</DialogHeader>
				{open ? (
					<CompanyForm
						initial={initial}
						editing={editing}
						members={members}
						onCancel={() => onOpenChange(false)}
						onSave={onSave}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function CompanyForm({
	initial,
	editing,
	members,
	onCancel,
	onSave,
}: {
	initial: CompanyInput;
	editing: boolean;
	members: { id: string; name: string }[];
	onCancel: () => void;
	onSave: (value: CompanyInput) => Promise<void>;
}) {
	const [error, setError] = useState<string | null>(null);
	const countries = useMemo(() => countryOptions(), []);
	const form = useForm({
		defaultValues: initial,
		validators: { onBlur: companyInputSchema, onSubmit: companyInputSchema },
		onSubmit: async ({ value }) => {
			setError(null);
			try {
				await onSave(companyInputSchema.parse(value));
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
				{TEXT_FIELDS.map(({ name, label, ...rest }) => {
					const { placeholder, ...input } = rest as typeof rest & {
						placeholder?: () => string;
					};
					return (
						<form.Field key={name} name={name}>
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={`company-${name}`}>{label()}</Label>
									<Input
										id={`company-${name}`}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										placeholder={placeholder?.()}
										aria-invalid={fieldErrors(field.state.meta).length > 0}
										aria-describedby={`company-${name}-error`}
										{...input}
									/>
									<FieldError
										id={`company-${name}-error`}
										meta={field.state.meta}
									/>
								</div>
							)}
						</form.Field>
					);
				})}
				<form.Field name="country">
					{(field) => (
						<OptionSelect
							id="company-country"
							label={m.common_country()}
							value={field.state.value}
							onChange={field.handleChange}
							emptyLabel={m.common_no_country()}
							options={countries.map((c) => ({
								value: c.code,
								label: c.name,
							}))}
						/>
					)}
				</form.Field>
				<form.Field name="ownerId">
					{(field) => (
						<OptionSelect
							id="company-owner"
							label={m.common_owner()}
							value={field.state.value}
							onChange={field.handleChange}
							emptyLabel={m.common_no_owner()}
							options={members.map((u) => ({ value: u.id, label: u.name }))}
						/>
					)}
				</form.Field>
			</div>
			<DialogFooter>
				<Button type="button" variant="ghost" onClick={onCancel}>
					{m.common_cancel()}
				</Button>
				<form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
					{([canSubmit, isSubmitting]) => (
						<Button type="submit" disabled={!canSubmit || isSubmitting}>
							{isSubmitting
								? m.common_saving()
								: editing
									? m.common_save_changes()
									: m.company_create()}
						</Button>
					)}
				</form.Subscribe>
			</DialogFooter>
		</form>
	);
}
