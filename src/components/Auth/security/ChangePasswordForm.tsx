import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Label } from "#/components/ui/label";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { changePasswordSchema, PASSWORD_MAX } from "#/lib/schema";
import {
	FieldError,
	FormAlert,
	fieldErrors,
	PasswordInput,
} from "../FormParts";
import { PasswordStrength } from "../PasswordStrength";

const FIELDS = [
	{
		name: "currentPassword",
		label: "Current password",
		autoComplete: "current-password",
	},
	{ name: "newPassword", label: "New password", autoComplete: "new-password" },
	{
		name: "confirmPassword",
		label: "Confirm new password",
		autoComplete: "new-password",
	},
] as const;

export function ChangePasswordForm() {
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);

	const form = useForm({
		defaultValues: {
			currentPassword: "",
			newPassword: "",
			confirmPassword: "",
			revokeOtherSessions: true,
		},
		validators: {
			onBlur: changePasswordSchema,
			onSubmit: changePasswordSchema,
		},
		onSubmit: async ({ value, formApi }) => {
			setStatus(null);
			const { error } = await authClient.changePassword({
				currentPassword: value.currentPassword,
				newPassword: value.newPassword,
				revokeOtherSessions: value.revokeOtherSessions,
			});
			if (error) {
				setStatus({ ok: false, message: authErrorMessage(error) });
				return;
			}
			formApi.reset();
			setStatus({
				ok: true,
				message: value.revokeOtherSessions
					? "Password changed. Your other devices have been signed out."
					: "Password changed.",
			});
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
			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>
			{FIELDS.map(({ name, label, autoComplete }) => (
				<form.Field key={name} name={name}>
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>{label}</Label>
							<PasswordInput
								id={field.name}
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								autoComplete={autoComplete}
								maxLength={PASSWORD_MAX}
								aria-invalid={fieldErrors(field.state.meta).length > 0}
								aria-describedby={`${field.name}-error`}
							/>
							{name === "newPassword" ? (
								<PasswordStrength password={field.state.value} />
							) : null}
							<FieldError id={`${field.name}-error`} meta={field.state.meta} />
						</div>
					)}
				</form.Field>
			))}
			<form.Field name="revokeOtherSessions">
				{(field) => (
					<div className="flex items-center gap-2">
						<Checkbox
							id={field.name}
							checked={field.state.value}
							onCheckedChange={(checked) =>
								field.handleChange(checked === true)
							}
						/>
						<Label htmlFor={field.name} className="font-normal">
							Sign out of all other devices
						</Label>
					</div>
				)}
			</form.Field>
			<form.Subscribe
				selector={(state) => [state.canSubmit, state.isSubmitting]}
			>
				{([canSubmit, isSubmitting]) => (
					<Button type="submit" disabled={!canSubmit || isSubmitting}>
						{isSubmitting ? "Saving..." : "Change password"}
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
