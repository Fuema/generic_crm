import { useForm } from "@tanstack/react-form";
import { Link, useRouter } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import type { SocialProvider } from "#/lib/auth-providers";
import { signInSchema } from "#/lib/schema";
import {
	Divider,
	FieldError,
	FormAlert,
	fieldErrors,
	PasswordInput,
} from "./FormParts";
import { SocialButtons } from "./SocialButtons";

export function SignInForm({
	providers,
	redirectTo,
	notice,
}: {
	providers: SocialProvider[];
	redirectTo: string;
	notice?: string;
}) {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(notice ?? null);
	const [passkeyPending, setPasskeyPending] = useState(false);

	const finishSignIn = async () => {
		await router.invalidate();
		await router.navigate({ to: redirectTo });
	};

	// Offer saved passkeys in the browser's autofill list (conditional UI)
	// biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
	useEffect(() => {
		if (typeof PublicKeyCredential === "undefined") return;
		void PublicKeyCredential.isConditionalMediationAvailable?.().then(
			(available) => {
				if (!available) return;
				void authClient.signIn.passkey({ autoFill: true }).then(({ error }) => {
					if (!error) void finishSignIn();
				});
			},
		);
	}, []);

	const form = useForm({
		defaultValues: { email: "", password: "", rememberMe: true },
		validators: {
			// Changed to onBlur to optimize performance and prevent aggressive early errors
			onBlur: signInSchema,
			onSubmit: signInSchema,
		},
		onSubmit: async ({ value }) => {
			setError(null);
			setInfo(null);
			const { data, error } = await authClient.signIn.email({
				email: value.email.trim().toLowerCase(),
				password: value.password,
				rememberMe: value.rememberMe,
			});

			if (error) {
				if (error.code === "EMAIL_NOT_VERIFIED") {
					setInfo(authErrorMessage(error));
				} else {
					setError(authErrorMessage(error));
				}
				return;
			}
			// With 2FA on there is no session yet: the client plugin redirects to /two-factor
			if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return;
			await finishSignIn();
		},
	});

	const signInWithPasskey = async () => {
		setError(null);
		setPasskeyPending(true);
		const { error } = await authClient.signIn.passkey();
		setPasskeyPending(false);
		if (error) {
			setError(authErrorMessage(error));
			return;
		}
		await finishSignIn();
	};

	return (
		<div className="space-y-6">
			<FormAlert message={error} />
			<FormAlert message={info} variant="success" />

			<SocialButtons
				providers={providers}
				callbackURL={redirectTo}
				onError={setError}
			/>
			<Button
				type="button"
				variant="outline"
				className="w-full"
				onClick={signInWithPasskey}
				disabled={passkeyPending}
			>
				<KeyRound />
				{passkeyPending ? "Waiting for passkey..." : "Sign in with a passkey"}
			</Button>

			<Divider label="Or continue with email" />

			<form
				noValidate
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-4"
			>
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
								autoComplete="username webauthn"
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
							<div className="flex items-center justify-between">
								<Label htmlFor={field.name}>Password</Label>
								<Link
									to="/forgot-password"
									className="text-sm text-muted-foreground underline-offset-4 hover:underline"
								>
									Forgot password?
								</Link>
							</div>
							<PasswordInput
								id={field.name}
								name={field.name}
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
								autoComplete="current-password"
								maxLength={128}
								aria-invalid={fieldErrors(field.state.meta).length > 0}
								aria-describedby={`${field.name}-error`}
							/>
							<FieldError id={`${field.name}-error`} meta={field.state.meta} />
						</div>
					)}
				</form.Field>

				<form.Field name="rememberMe">
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
								Keep me signed in for 7 days
							</Label>
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
							{isSubmitting ? "Signing in..." : "Sign in"}
						</Button>
					)}
				</form.Subscribe>
			</form>
		</div>
	);
}
