import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { FormAlert } from "../FormParts";

export function PasskeySettings() {
	const { data: passkeys, isPending, refetch } = authClient.useListPasskeys();
	const [name, setName] = useState("");
	const [pending, setPending] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);

	const add = async () => {
		const trimmed = name.trim();
		if (trimmed.length > 50) {
			setStatus({
				ok: false,
				message: "Use a name of 50 characters or fewer.",
			});
			return;
		}
		setStatus(null);
		setPending(true);
		const result = await authClient.passkey.addPasskey({
			name: trimmed || undefined,
		});
		setPending(false);
		if (result?.error) {
			setStatus({ ok: false, message: authErrorMessage(result.error) });
			return;
		}
		setName("");
		setStatus({
			ok: true,
			message: "Passkey added. You can now sign in with it.",
		});
		refetch();
	};

	const remove = async (id: string) => {
		if (
			!window.confirm(
				"Remove this passkey? You won't be able to sign in with it anymore.",
			)
		)
			return;
		const { error } = await authClient.passkey.deletePasskey({ id });
		if (error) {
			setStatus({ ok: false, message: authErrorMessage(error) });
			return;
		}
		setStatus({ ok: true, message: "Passkey removed." });
		refetch();
	};

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				Sign in with your fingerprint, face or a security key instead of a
				password. Passkeys can't be phished.
			</p>
			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			{isPending ? (
				<p className="text-sm text-muted-foreground">Loading passkeys...</p>
			) : passkeys?.length ? (
				<ul className="divide-y rounded-lg border">
					{passkeys.map((p) => (
						<li key={p.id} className="flex items-center gap-3 p-3">
							<KeyRound className="size-4 shrink-0" aria-hidden="true" />
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">
									{p.name || "Unnamed passkey"}
								</p>
								<p className="text-xs text-muted-foreground">
									Added{" "}
									{p.createdAt
										? new Date(p.createdAt).toLocaleDateString()
										: "recently"}
									{p.backedUp ? " · synced" : ""}
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => remove(p.id)}
								aria-label={`Remove ${p.name || "passkey"}`}
							>
								<Trash2 />
							</Button>
						</li>
					))}
				</ul>
			) : (
				<p className="text-sm text-muted-foreground">No passkeys yet.</p>
			)}

			<form
				onSubmit={(e) => {
					e.preventDefault();
					void add();
				}}
				className="flex flex-col gap-2 sm:flex-row sm:items-end"
			>
				<div className="flex-1 space-y-2">
					<Label htmlFor="passkey-name">Name (optional)</Label>
					<Input
						id="passkey-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="e.g. Work laptop"
						maxLength={50}
					/>
				</div>
				<Button type="submit" disabled={pending}>
					{pending ? "Waiting for device..." : "Add a passkey"}
				</Button>
			</form>
		</div>
	);
}
