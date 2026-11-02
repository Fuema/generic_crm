import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
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
				message: m.passkey_name_too_long(),
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
			message: m.passkey_added(),
		});
		refetch();
	};

	const remove = async (id: string) => {
		if (!window.confirm(m.passkey_remove_confirm())) return;
		const { error } = await authClient.passkey.deletePasskey({ id });
		if (error) {
			setStatus({ ok: false, message: authErrorMessage(error) });
			return;
		}
		setStatus({ ok: true, message: m.passkey_removed() });
		refetch();
	};

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">{m.passkey_intro()}</p>
			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			{isPending ? (
				<p className="text-sm text-muted-foreground">{m.passkey_loading()}</p>
			) : passkeys?.length ? (
				<ul className="divide-y rounded-lg border">
					{passkeys.map((p) => (
						<li key={p.id} className="flex items-center gap-3 p-3">
							<KeyRound className="size-4 shrink-0" aria-hidden="true" />
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium">
									{p.name || m.passkey_unnamed()}
								</p>
								<p className="text-xs text-muted-foreground">
									{p.createdAt
										? m.passkey_added_on({
												date: new Date(p.createdAt).toLocaleDateString(
													getLocale(),
												),
											})
										: m.passkey_added_recently()}
									{p.backedUp ? ` · ${m.passkey_synced()}` : ""}
								</p>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => remove(p.id)}
								aria-label={m.passkey_remove({
									name: p.name || m.passkey_fallback_name(),
								})}
							>
								<Trash2 />
							</Button>
						</li>
					))}
				</ul>
			) : (
				<p className="text-sm text-muted-foreground">{m.passkey_none()}</p>
			)}

			<form
				onSubmit={(e) => {
					e.preventDefault();
					void add();
				}}
				className="flex flex-col gap-2 sm:flex-row sm:items-end"
			>
				<div className="flex-1 space-y-2">
					<Label htmlFor="passkey-name">{m.passkey_name_label()}</Label>
					<Input
						id="passkey-name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={m.passkey_name_placeholder()}
						maxLength={50}
					/>
				</div>
				<Button type="submit" disabled={pending}>
					{pending ? m.passkey_waiting() : m.passkey_add()}
				</Button>
			</form>
		</div>
	);
}
