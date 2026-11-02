import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { backupCodeSchema, otpSchema } from "#/lib/schema";
import { FormAlert } from "./FormParts";
import { OtpField } from "./OtpField";

type Method = "totp" | "email" | "backup";

const METHODS: Record<Method, { label: string; hint: string }> = {
	totp: {
		label: "Authenticator app",
		hint: "Enter the 6-digit code from your authenticator app.",
	},
	email: {
		label: "Email code",
		hint: "We'll email you a 6-digit code that's valid for 3 minutes.",
	},
	backup: {
		label: "Backup code",
		hint: "Enter one of the backup codes you saved. Each code works once.",
	},
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
		setInfo("Code sent. Check your inbox.");
	};

	const verify = async (value = code) => {
		const parsed =
			method === "backup"
				? backupCodeSchema.safeParse(value)
				: otpSchema.safeParse(value);
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? "Invalid code");
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
				aria-label="Verification method"
			>
				{(Object.keys(METHODS) as Method[]).map((m) => (
					<button
						key={m}
						type="button"
						role="tab"
						aria-selected={method === m}
						onClick={() => switchTo(m)}
						className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
							method === m
								? "bg-background shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{METHODS[m].label}
					</button>
				))}
			</div>

			<p className="text-center text-sm text-muted-foreground">
				{METHODS[method].hint}
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
						{pending ? "Sending..." : "Email me a code"}
					</Button>
				) : (
					<>
						<Label htmlFor="code" className="sr-only">
							{method === "backup" ? "Backup code" : "Verification code"}
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
								Trust this device for 30 days
							</Label>
						</div>

						<Button
							type="submit"
							className="w-full"
							disabled={pending || !code}
						>
							{pending ? "Verifying..." : "Verify"}
						</Button>

						{method === "email" ? (
							<Button
								type="button"
								variant="link"
								className="w-full"
								onClick={sendEmailCode}
								disabled={pending}
							>
								Send a new code
							</Button>
						) : null}
					</>
				)}
			</form>
		</div>
	);
}
