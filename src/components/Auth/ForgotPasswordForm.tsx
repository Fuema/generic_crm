import { useForm } from "@tanstack/react-form";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { forgotPasswordSchema } from "#/lib/schema";
import { m } from "#/paraglide/messages.js";
import { FieldError, FormAlert, fieldErrors } from "./FormParts";

export function ForgotPasswordForm() {
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	const form = useForm({
		defaultValues: { email: "" },
		validators: {
			onBlur: forgotPasswordSchema,
			onSubmit: forgotPasswordSchema,
		},
		onSubmit: async ({ value }) => {
			setError(null);
			const { error } = await authClient.requestPasswordReset({
				email: value.email.trim().toLowerCase(),
				redirectTo: "/reset-password",
			});
			// Show the same message whether or not the account exists, so the form
			// can't be used to find out which emails are registered
			if (error && error.status === 429) {
				setError(authErrorMessage(error));
				return;
			}
			setDone(true);
		},
	});

	if (done) {
		return (
			<div className="space-y-3 text-center">
				<MailCheck
					className="mx-auto size-12 text-primary"
					aria-hidden="true"
				/>
				<p>{m.auth_forgot_done()}</p>
			</div>
		);
	}

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
			<form.Field name="email">
				{(field) => (
					<div className="space-y-2">
						<Label htmlFor={field.name}>{m.common_email()}</Label>
						<Input
							id={field.name}
							type="email"
							name={field.name}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							placeholder={m.common_email_placeholder()}
							autoComplete="email"
							inputMode="email"
							maxLength={254}
							aria-invalid={fieldErrors(field.state.meta).length > 0}
							aria-describedby={`${field.name}-error`}
						/>
						<FieldError id={`${field.name}-error`} meta={field.state.meta} />
					</div>
				)}
			</form.Field>
			<form.Subscribe
				selector={(state) => [state.canSubmit, state.isSubmitting]}
			>
				{([canSubmit, isSubmitting]) => (
					<Button
						type="submit"
						className="w-full"
						disabled={!canSubmit || isSubmitting}
					>
						{isSubmitting ? m.common_sending() : m.auth_forgot_submit()}
					</Button>
				)}
			</form.Subscribe>
		</form>
	);
}
