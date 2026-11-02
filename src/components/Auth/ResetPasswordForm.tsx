import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { PASSWORD_MAX, resetPasswordSchema } from "#/lib/schema";
import { m } from "#/paraglide/messages.js";
import { FieldError, FormAlert, fieldErrors, PasswordInput } from "./FormParts";
import { PasswordStrength } from "./PasswordStrength";

export function ResetPasswordForm({ token }: { token: string }) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { password: "", confirmPassword: "" },
		validators: { onBlur: resetPasswordSchema, onSubmit: resetPasswordSchema },
		onSubmit: async ({ value }) => {
			setError(null);
			const { error } = await authClient.resetPassword({
				newPassword: value.password,
				token,
			});
			if (error) {
				setError(authErrorMessage(error));
				return;
			}
			await router.navigate({
				to: "/login",
				search: { notice: "password-reset" },
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
			<FormAlert message={error} />
			<form.Field name="password">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor={field.name}>{m.auth_reset_new_password()}</Label>
						<PasswordInput
							id={field.name}
							name={field.name}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							autoComplete="new-password"
							maxLength={PASSWORD_MAX}
							aria-invalid={fieldErrors(field.state.meta).length > 0}
							aria-describedby={`${field.name}-error`}
						/>
						<PasswordStrength password={field.state.value} />
						<FieldError id={`${field.name}-error`} meta={field.state.meta} />
					</div>
				)}
			</form.Field>
			<form.Field name="confirmPassword">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor={field.name}>{m.auth_reset_confirm()}</Label>
						<PasswordInput
							id={field.name}
							name={field.name}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							autoComplete="new-password"
							maxLength={PASSWORD_MAX}
							aria-invalid={fieldErrors(field.state.meta).length > 0}
							aria-describedby={`${field.name}-error`}
						/>
						<FieldError id={`${field.name}-error`} meta={field.state.meta} />
					</div>
				)}
			</form.Field>
			<p className="text-xs text-muted-foreground">
				{m.auth_reset_signed_out_note()}
			</p>
			<form.Subscribe
				selector={(state) => [state.canSubmit, state.isSubmitting]}
			>
				{([canSubmit, isSubmitting]) => (
					<Button
						type="submit"
						className="w-full"
						disabled={!canSubmit || isSubmitting}
					>
						{isSubmitting ? m.auth_reset_submitting() : m.auth_reset_submit()}
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
