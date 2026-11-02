import { useForm } from "@tanstack/react-form";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import type { SocialProvider } from "#/lib/auth-providers";
import { PASSWORD_MAX, signUpSchema } from "#/lib/schema";
import {
	Divider,
	FieldError,
	FormAlert,
	fieldErrors,
	PasswordInput,
} from "./FormParts";
import { PasswordStrength } from "./PasswordStrength";
import { SocialButtons } from "./SocialButtons";

export function SignUpForm({ providers }: { providers: SocialProvider[] }) {
	const [error, setError] = useState<string | null>(null);
	const [sentTo, setSentTo] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			password: "",
			confirmPassword: "",
			acceptTerms: false,
		},
		validators: {
			// Runs validation when a user leaves an input field
			onBlur: signUpSchema,
			onSubmit: signUpSchema,
		},
		onSubmit: async ({ value }) => {
			setError(null);
			const email = value.email.trim().toLowerCase();
			const { error } = await authClient.signUp.email({
				email,
				password: value.password,
				name: value.name.trim(),
				// Where the verification link lands
				callbackURL: "/verify-email",
			});

			if (error) {
				setError(authErrorMessage(error));
				return;
			}
			setSentTo(email);
		},
	});

	if (sentTo) {
		return <CheckInbox email={sentTo} />;
	}

	return (
		<div className="space-y-6">
			<FormAlert message={error} />
			<SocialButtons
				providers={providers}
				callbackURL="/dashboard"
				onError={setError}
			/>
			{providers.length ? <Divider label="Or sign up with email" /> : null}

			<form
				noValidate
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-4"
			>
				<form.Field name="name">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>Full name</Label>
							<Input
								id={field.name}
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="Jane Doe"
								autoComplete="name"
								maxLength={50}
								aria-invalid={fieldErrors(field.state.meta).length > 0}
								aria-describedby={`${field.name}-error`}
							/>
							<FieldError id={`${field.name}-error`} meta={field.state.meta} />
						</div>
					)}
				</form.Field>

				<form.Field name="email">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>Email</Label>
							<Input
								id={field.name}
								type="email"
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								placeholder="you@example.com"
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

				<form.Field name="password">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>Password</Label>
							<PasswordInput
								id={field.name}
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								autoComplete="new-password"
								maxLength={PASSWORD_MAX}
								aria-invalid={fieldErrors(field.state.meta).length > 0}
								aria-describedby={`${field.name}-error ${field.name}-strength`}
							/>
							<div id={`${field.name}-strength`}>
								<PasswordStrength password={field.state.value} />
							</div>
							<FieldError id={`${field.name}-error`} meta={field.state.meta} />
						</div>
					)}
				</form.Field>

				<form.Field name="confirmPassword">
					{(field) => (
						<div className="space-y-2">
							<Label htmlFor={field.name}>Confirm password</Label>
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

				<form.Field name="acceptTerms">
					{(field) => (
						<div className="space-y-2">
							<div className="flex items-start gap-2">
								<Checkbox
									id={field.name}
									checked={field.state.value}
									onCheckedChange={(checked) => {
										field.handleChange(checked === true);
										field.handleBlur();
									}}
									aria-invalid={fieldErrors(field.state.meta).length > 0}
									aria-describedby={`${field.name}-error`}
								/>
								<Label
									htmlFor={field.name}
									className="leading-snug font-normal"
								>
									I agree to the Terms of Service and Privacy Policy
								</Label>
							</div>
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
							{isSubmitting ? "Creating account..." : "Create account"}
						</Button>
					)}
				</form.Subscribe>
			</form>
		</div>
	);
}

function CheckInbox({ email }: { email: string }) {
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const [pending, setPending] = useState(false);

	const resend = async () => {
		setPending(true);
		const { error } = await authClient.sendVerificationEmail({
			email,
			callbackURL: "/verify-email",
		});
		setPending(false);
		setStatus(
			error
				? { ok: false, message: authErrorMessage(error) }
				: { ok: true, message: "We sent you a new link." },
		);
	};

	return (
		<div className="space-y-4 text-center">
			<MailCheck className="mx-auto size-12 text-primary" aria-hidden="true" />
			<p>
				We sent a verification link to{" "}
				<strong className="break-all">{email}</strong>. Open it to activate your
				account. The link expires in 1 hour.
			</p>
			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>
			<Button
				type="button"
				variant="outline"
				className="w-full"
				onClick={resend}
				disabled={pending}
			>
				{pending ? "Sending..." : "Resend the email"}
			</Button>
		</div>
	);
}
