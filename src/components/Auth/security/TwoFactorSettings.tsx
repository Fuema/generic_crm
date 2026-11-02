import { useRouter } from "@tanstack/react-router";
import { Copy, Download, ShieldCheck } from "lucide-react";
import { useState } from "react";
import QRCode from "react-qr-code";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { otpSchema } from "#/lib/schema";
import { FormAlert, PasswordInput } from "../FormParts";
import { OtpField } from "../OtpField";

type Step =
	| { name: "idle" }
	| { name: "password"; action: "enable" | "disable" | "codes" }
	| { name: "scan"; totpURI: string; backupCodes: string[] }
	| { name: "codes"; backupCodes: string[] };

function secretFromURI(uri: string) {
	return new URL(uri).searchParams.get("secret") ?? "";
}

function BackupCodes({ codes }: { codes: string[] }) {
	const text = codes.join("\n");
	const download = () => {
		const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
		const link = Object.assign(document.createElement("a"), {
			href: url,
			download: "backup-codes.txt",
		});
		link.click();
		URL.revokeObjectURL(url);
	};
	return (
		<div className="space-y-3">
			<p className="text-sm text-muted-foreground">
				Save these backup codes somewhere safe. Each one signs you in once if
				you lose your authenticator. They won't be shown again.
			</p>
			<ul className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4 font-mono text-sm">
				{codes.map((c) => (
					<li key={c}>{c}</li>
				))}
			</ul>
			<div className="flex gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => navigator.clipboard.writeText(text)}
				>
					<Copy /> Copy
				</Button>
				<Button type="button" variant="outline" size="sm" onClick={download}>
					<Download /> Download
				</Button>
			</div>
		</div>
	);
}

export function TwoFactorSettings({
	enabled,
	hasPassword,
}: {
	enabled: boolean;
	hasPassword: boolean;
}) {
	const router = useRouter();
	const [step, setStep] = useState<Step>({ name: "idle" });
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);

	const reset = () => {
		setStep({ name: "idle" });
		setPassword("");
		setCode("");
	};

	const submitPassword = async (action: "enable" | "disable" | "codes") => {
		if (!password) {
			setStatus({ ok: false, message: "Enter your password to continue." });
			return;
		}
		setStatus(null);
		setPending(true);
		if (action === "enable") {
			const { data, error } = await authClient.twoFactor.enable({ password });
			setPending(false);
			if (error || !data)
				return setStatus({ ok: false, message: authErrorMessage(error) });
			if (!("totpURI" in data))
				return setStatus({
					ok: false,
					message: "Authenticator setup isn't available.",
				});
			setPassword("");
			setStep({
				name: "scan",
				totpURI: data.totpURI,
				backupCodes: data.backupCodes,
			});
		} else if (action === "disable") {
			const { error } = await authClient.twoFactor.disable({ password });
			setPending(false);
			if (error)
				return setStatus({ ok: false, message: authErrorMessage(error) });
			reset();
			setStatus({ ok: true, message: "Two-factor authentication is off." });
			await router.invalidate();
		} else {
			const { data, error } = await authClient.twoFactor.generateBackupCodes({
				password,
			});
			setPending(false);
			if (error || !data)
				return setStatus({ ok: false, message: authErrorMessage(error) });
			setPassword("");
			setStep({ name: "codes", backupCodes: data.backupCodes });
			setStatus({
				ok: true,
				message: "New backup codes generated. Your old codes no longer work.",
			});
		}
	};

	// Enabling only takes effect once the user proves the authenticator works
	const confirmCode = async (value = code) => {
		if (!otpSchema.safeParse(value).success) return;
		setPending(true);
		const { error } = await authClient.twoFactor.verifyTotp({ code: value });
		setPending(false);
		if (error) {
			setCode("");
			return setStatus({ ok: false, message: authErrorMessage(error) });
		}
		if (step.name === "scan")
			setStep({ name: "codes", backupCodes: step.backupCodes });
		setStatus({ ok: true, message: "Two-factor authentication is on." });
		await router.invalidate();
	};

	if (!hasPassword) {
		return (
			<p className="text-sm text-muted-foreground">
				You signed up with a social account. Set a password first (use "Forgot
				password" on the sign-in page) to turn on two-factor authentication, or
				add a passkey below.
			</p>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<ShieldCheck className="size-5" aria-hidden="true" />
				<span className="font-medium">Status</span>
				<Badge variant={enabled ? "default" : "secondary"}>
					{enabled ? "On" : "Off"}
				</Badge>
			</div>
			<p className="text-sm text-muted-foreground">
				When it's on, signing in with your password also needs a code from your
				authenticator app. You can also get a code by email or use a backup
				code.
			</p>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			{step.name === "idle" ? (
				<div className="flex flex-wrap gap-2">
					{enabled ? (
						<>
							<Button
								type="button"
								variant="outline"
								onClick={() => setStep({ name: "password", action: "codes" })}
							>
								New backup codes
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={() => setStep({ name: "password", action: "disable" })}
							>
								Turn off
							</Button>
						</>
					) : (
						<Button
							type="button"
							onClick={() => setStep({ name: "password", action: "enable" })}
						>
							Turn on two-factor authentication
						</Button>
					)}
				</div>
			) : null}

			{step.name === "password" ? (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						void submitPassword(step.action);
					}}
					className="space-y-3"
				>
					<Label htmlFor="2fa-password">Confirm your password</Label>
					<PasswordInput
						id="2fa-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						autoComplete="current-password"
						maxLength={128}
					/>
					<div className="flex gap-2">
						<Button type="submit" disabled={pending}>
							{pending ? "Checking..." : "Continue"}
						</Button>
						<Button type="button" variant="ghost" onClick={reset}>
							Cancel
						</Button>
					</div>
				</form>
			) : null}

			{step.name === "scan" ? (
				<div className="space-y-4">
					<p className="text-sm">
						1. Scan this QR code with your authenticator app.
					</p>
					<div className="w-fit rounded-lg bg-white p-4">
						<QRCode
							value={step.totpURI}
							size={176}
							aria-label="QR code for your authenticator app"
						/>
					</div>
					<p className="text-sm text-muted-foreground">
						Can't scan it? Enter this key manually:{" "}
						<code className="break-all rounded bg-muted px-1 font-mono">
							{secretFromURI(step.totpURI)}
						</code>
					</p>
					<Label htmlFor="2fa-code" className="text-sm font-normal">
						2. Enter the 6-digit code it shows.
					</Label>
					<OtpField
						id="2fa-code"
						value={code}
						onChange={setCode}
						onComplete={(v) => void confirmCode(v)}
						disabled={pending}
					/>
					<div className="flex gap-2">
						<Button
							type="button"
							onClick={() => void confirmCode()}
							disabled={pending || code.length !== 6}
						>
							{pending ? "Verifying..." : "Verify and turn on"}
						</Button>
						<Button type="button" variant="ghost" onClick={reset}>
							Cancel
						</Button>
					</div>
				</div>
			) : null}

			{step.name === "codes" ? (
				<div className="space-y-3">
					<BackupCodes codes={step.backupCodes} />
					<Button type="button" onClick={reset}>
						I've saved my codes
					</Button>
				</div>
			) : null}
		</div>
	);
}
