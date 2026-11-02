import { useForm } from "@tanstack/react-form";
import { useState } from "react";
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
import { m } from "#/paraglide/messages.js";
import {
	CONSENT_LABELS,
	type ContactInput,
	contactInputSchema,
	EMAIL_CONSENTS,
	LIFECYCLE_STAGES,
	STAGE_LABELS,
} from "../schema";
import { OptionSelect } from "./fields";

export const EMPTY_CONTACT: ContactInput = {
	firstName: "",
	lastName: "",
	email: "",
	phone: "",
	jobTitle: "",
	companyId: "",
	ownerId: "",
	lifecycleStage: "lead",
	locale: "",
	emailConsent: "unknown",
};

export type ContactFormOptions = {
	members: { id: string; name: string }[];
	companies: { id: string; name: string }[];
};

const TEXT_FIELDS = [
	{
		name: "firstName",
		label: m.contact_first_name,
		autoComplete: "given-name",
		maxLength: 100,
	},
	{
		name: "lastName",
		label: m.contact_last_name,
		autoComplete: "family-name",
		maxLength: 100,
	},
	{
		name: "email",
		label: m.contact_email,
		autoComplete: "email",
		maxLength: 254,
		type: "email",
	},
	{
		name: "phone",
		label: m.common_phone,
		autoComplete: "tel",
		maxLength: 25,
		type: "tel",
	},
	{
		name: "jobTitle",
		label: m.contact_job_title,
		autoComplete: "organization-title",
		maxLength: 100,
	},
] as const;

export function ContactFormDialog({
	open,
	onOpenChange,
	initial,
	editing,
	options,
	onSave,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	initial: ContactInput;
	editing: boolean;
	options: ContactFormOptions;
	onSave: (value: ContactInput) => Promise<void>;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{editing ? m.contact_edit_title() : m.contact_new_title()}
					</DialogTitle>
					<DialogDescription>{m.contact_form_description()}</DialogDescription>
				</DialogHeader>
				{/* Remount per open so the form starts from the right values */}
				{open ? (
					<ContactForm
						initial={initial}
						editing={editing}
						options={options}
						onCancel={() => onOpenChange(false)}
						onSave={onSave}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function ContactForm({
	initial,
	editing,
	options,
	onCancel,
	onSave,
}: {
	initial: ContactInput;
	editing: boolean;
	options: ContactFormOptions;
	onCancel: () => void;
	onSave: (value: ContactInput) => Promise<void>;
}) {
	const [error, setError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: initial,
		validators: { onBlur: contactInputSchema, onSubmit: contactInputSchema },
		onSubmit: async ({ value }) => {
			setError(null);
			try {
				await onSave(contactInputSchema.parse(value));
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
				{TEXT_FIELDS.map(({ name, label, ...input }) => (
					<form.Field key={name} name={name}>
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={`contact-${name}`}>{label()}</Label>
								<Input
									id={`contact-${name}`}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									aria-invalid={fieldErrors(field.state.meta).length > 0}
									aria-describedby={`contact-${name}-error`}
									{...input}
								/>
								<FieldError
									id={`contact-${name}-error`}
									meta={field.state.meta}
								/>
							</div>
						)}
					</form.Field>
				))}
				<form.Field name="companyId">
					{(field) => (
						<OptionSelect
							id="contact-company"
							label={m.contact_company()}
							value={field.state.value}
							onChange={field.handleChange}
							emptyLabel={m.contact_no_company()}
							options={options.companies.map((c) => ({
								value: c.id,
								label: c.name,
							}))}
						/>
					)}
				</form.Field>
				<form.Field name="lifecycleStage">
					{(field) => (
						<OptionSelect
							id="contact-stage"
							label={m.contact_stage()}
							value={field.state.value}
							onChange={(v) =>
								field.handleChange(v as ContactInput["lifecycleStage"])
							}
							options={LIFECYCLE_STAGES.map((s) => ({
								value: s,
								label: STAGE_LABELS[s](),
							}))}
						/>
					)}
				</form.Field>
				<form.Field name="ownerId">
					{(field) => (
						<OptionSelect
							id="contact-owner"
							label={m.common_owner()}
							value={field.state.value}
							onChange={field.handleChange}
							emptyLabel={m.common_no_owner()}
							options={options.members.map((u) => ({
								value: u.id,
								label: u.name,
							}))}
						/>
					)}
				</form.Field>
				<form.Field name="locale">
					{(field) => (
						<OptionSelect
							id="contact-locale"
							label={m.contact_language()}
							value={field.state.value}
							onChange={(v) => field.handleChange(v as ContactInput["locale"])}
							emptyLabel={m.contact_language_default()}
							options={[
								{ value: "en", label: m.language_en() },
								{ value: "es", label: m.language_es() },
							]}
						/>
					)}
				</form.Field>
				<form.Field name="emailConsent">
					{(field) => (
						<OptionSelect
							id="contact-consent"
							label={m.contact_consent()}
							value={field.state.value}
							onChange={(v) =>
								field.handleChange(v as ContactInput["emailConsent"])
							}
							options={EMAIL_CONSENTS.map((c) => ({
								value: c,
								label: CONSENT_LABELS[c](),
							}))}
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
									: m.contact_create()}
						</Button>
					)}
				</form.Subscribe>
			</DialogFooter>
		</form>
	);
}
