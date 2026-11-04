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
import { OptionSelect } from "#/modules/contacts/components/fields";
import {
	type ContactChoice,
	ContactPicker,
} from "#/modules/deals/components/DealFormDialog";
import {
	CustomFieldInputs,
	initialFormValues,
	toCustomInput,
} from "#/modules/fields/components/CustomFields";
import type { RecordFields } from "#/modules/fields/fields";
import type { FormValue } from "#/modules/fields/values";
import { m } from "#/paraglide/messages.js";
import {
	PROJECT_STATUS_LABELS,
	PROJECT_STATUSES,
	type ProjectInput,
	projectInputSchema,
} from "../schema";

export const EMPTY_PROJECT: ProjectInput = {
	name: "",
	description: "",
	status: "planned",
	startDate: "",
	dueDate: "",
	ownerId: "",
	contactId: "",
	companyId: "",
};

export function ProjectFormDialog({
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
	initial: ProjectInput;
	initialContact: ContactChoice | null;
	initialCustom: Record<string, unknown>;
	editing: boolean;
	fields: RecordFields;
	options: {
		members: { id: string; name: string }[];
		companies: { id: string; name: string }[];
	};
	onSave: (value: ProjectInput) => Promise<void>;
}) {
	const [value, setValue] = useState(initial);
	const [contact, setContact] = useState(initialContact);
	const [custom, setCustom] = useState<Record<string, FormValue>>(() =>
		initialFormValues(fields.fields, initialCustom),
	);
	const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const patch = (p: Partial<ProjectInput>) => setValue((v) => ({ ...v, ...p }));

	const submit = async () => {
		setError(null);
		const parsed = projectInputSchema.safeParse({
			...value,
			contactId: contact?.id ?? "",
		});
		const { input, errors } = toCustomInput(fields.fields, custom);
		setCustomErrors(errors);
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? m.error_generic());
			return;
		}
		if (Object.keys(errors).length) return;
		setBusy(true);
		try {
			await onSave({ ...parsed.data, custom: input });
		} catch (e) {
			setError(await serverErrorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{editing ? m.project_edit_title() : m.project_new_title()}
					</DialogTitle>
					<DialogDescription>{m.project_form_description()}</DialogDescription>
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
						<Label htmlFor="project-name">{m.project_name()}</Label>
						<Input
							id="project-name"
							value={value.name}
							maxLength={120}
							onChange={(e) => patch({ name: e.target.value })}
						/>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<OptionSelect
							id="project-status"
							label={m.quote_status()}
							value={value.status}
							onChange={(v) => patch({ status: v as ProjectInput["status"] })}
							options={PROJECT_STATUSES.map((s) => ({
								value: s,
								label: PROJECT_STATUS_LABELS[s](),
							}))}
						/>
						<OptionSelect
							id="project-owner"
							label={m.common_owner()}
							value={value.ownerId}
							emptyLabel={m.common_none()}
							onChange={(v) => patch({ ownerId: v })}
							options={options.members.map((u) => ({
								value: u.id,
								label: u.name,
							}))}
						/>
						<div className="space-y-2">
							<Label htmlFor="project-start">{m.project_start()}</Label>
							<Input
								id="project-start"
								type="date"
								value={value.startDate}
								onChange={(e) => patch({ startDate: e.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="project-due">{m.project_due()}</Label>
							<Input
								id="project-due"
								type="date"
								value={value.dueDate}
								onChange={(e) => patch({ dueDate: e.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="project-contact">{m.project_contact()}</Label>
							<ContactPicker
								id="project-contact"
								value={contact}
								invalid={false}
								onChange={(c) => {
									setContact(c);
									if (c?.companyId && !value.companyId)
										patch({ companyId: c.companyId });
								}}
							/>
						</div>
						<OptionSelect
							id="project-company"
							label={m.contact_company()}
							value={value.companyId}
							emptyLabel={m.common_none()}
							onChange={(v) => patch({ companyId: v })}
							options={options.companies.map((c) => ({
								value: c.id,
								label: c.name,
							}))}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="project-description">
							{m.product_description()}
						</Label>
						<Textarea
							id="project-description"
							value={value.description}
							maxLength={2000}
							onChange={(e) => patch({ description: e.target.value })}
						/>
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
									: m.project_create()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
