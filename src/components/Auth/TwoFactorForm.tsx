import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { backupCodeSchema, otpSchema } from "#/lib/schema";
import { m } from "#/paraglide/messages.js";
import { FormAlert } from "./FormParts";
import { OtpField } from "./OtpField";

type Method = "totp" | "email" | "backup";

const METHODS: Record<Method, { label: () => string; hint: () => string }> = {
	totp: { label: m.auth_2fa_totp, hint: m.auth_2fa_totp_hint },
	email: { label: m.auth_2fa_email, hint: m.auth_2fa_email_hint },
	backup: { label: m.auth_2fa_backup, hint: m.auth_2fa_backup_hint },
};

// Backup codes are stored as XXXXX-XXXXX; accept them typed without the hyphen too
function normalizeBackupCode(value: string) {
	const compact = value.trim().replace("-", "");
	return compact.length === 10
		? `${compact.slice(0, 5)}-${compact.slice(5)}`
		: value.trim();
}

export function TwoFactorForm() {
	const router = useRouter();
	const [method, setMethod] = useState<Method>("totp");
	const [code, setCode] = useState("");
	const [trustDevice, setTrustDevice] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);
	const [emailSent, setEmailSent] = useState(false);

	const switchTo = (next: Method) => {
		setMethod(next);
		setCode("");
		setError(null);
		setInfo(null);
	};

	const sendEmailCode = async () => {
		setError(null);
		setPending(true);
		const { error } = await authClient.twoFactor.sendOtp({ trustDevice });
		setPending(false);
		if (error) {
			setError(authErrorMessage(error));
			return;
		}
		setEmailSent(true);
		setInfo(m.auth_2fa_code_sent());
	};

	const verify = async (value = code) => {
		const parsed =
			method === "backup"
				? backupCodeSchema.safeParse(value)
				: otpSchema.safeParse(value);
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? m.auth_2fa_invalid_code());
			return;
		}

		setError(null);
		setPending(true);
		const request =
			method === "totp"
				? authClient.twoFactor.verifyTotp({ code: value, trustDevice })
				: method === "email"
					? authClient.twoFactor.verifyOtp({ code: value, trustDevice })
					: authClient.twoFactor.verifyBackupCode({
							code: normalizeBackupCode(value),
							trustDevice,
						});
		const { error } = await request;
		setPending(false);

		if (error) {
			setError(authErrorMessage(error));
			setCode("");
			return;
		}
		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	};

	return (
		<div className="space-y-6">
			<div
				className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
				role="tablist"
				aria-label={m.auth_2fa_methods()}
			>
				{(Object.keys(METHODS) as Method[]).map((id) => (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={method === id}
						onClick={() => switchTo(id)}
						className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
							method === id
								? "bg-background shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{METHODS[id].label()}
					</button>
				))}
			</div>

			<p className="text-center text-sm text-muted-foreground">
				{METHODS[method].hint()}
			</p>

			<FormAlert message={error} />
			<FormAlert message={info} variant="success" />

			<form
				noValidate
				onSubmit={(e) => {
					e.preventDefault();
					void verify();
				}}
				className="space-y-4"
			>
				{method === "email" && !emailSent ? (
					<Button
						type="button"
						className="w-full"
						onClick={sendEmailCode}
						disabled={pending}
					>
						{pending ? m.common_sending() : m.auth_2fa_email_me()}
					</Button>
				) : (
					<>
						<Label htmlFor="code" className="sr-only">
							{method === "backup"
								? m.auth_2fa_backup()
								: m.auth_2fa_code_label()}
						</Label>
						{method === "backup" ? (
							<Input
								id="code"
								value={code}
								onChange={(e) => setCode(e.target.value)}
								placeholder="ABCDE-12345"
								autoComplete="off"
								autoCapitalize="off"
								spellCheck={false}
								maxLength={11}
								className="text-center font-mono tracking-widest"
								aria-invalid={Boolean(error)}
							/>
						) : (
							<OtpField
								id="code"
								value={code}
								onChange={setCode}
								onComplete={(value) => void verify(value)}
								disabled={pending}
								invalid={Boolean(error)}
							/>
						)}

						<div className="flex items-center gap-2">
							<Checkbox
								id="trust-device"
								checked={trustDevice}
								onCheckedChange={(checked) => setTrustDevice(checked === true)}
							/>
							<Label htmlFor="trust-device" className="font-normal">
								{m.auth_2fa_trust()}
							</Label>
						</div>

						<Button
							type="submit"
							className="w-full"
							disabled={pending || !code}
						>
							{pending ? m.auth_2fa_verifying() : m.auth_2fa_verify()}
						</Button>

						{method === "email" ? (
							<Button
								type="button"
								variant="link"
								className="w-full"
								onClick={sendEmailCode}
								disabled={pending}
							>
								{m.auth_2fa_new_code()}
							</Button>
						) : null}
					</>
				)}
			</form>
		</div>
	);
}
