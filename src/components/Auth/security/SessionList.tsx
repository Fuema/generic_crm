import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import { FormAlert } from "../FormParts";

// Very small user-agent summary, enough to recognise a device
function describeDevice(userAgent?: string | null) {
	if (!userAgent) return { label: m.session_unknown_device(), mobile: false };
	const browser = /Edg\//.test(userAgent)
		? "Edge"
		: /Firefox\//.test(userAgent)
			? "Firefox"
			: /Chrome\//.test(userAgent)
				? "Chrome"
				: /Safari\//.test(userAgent)
					? "Safari"
					: m.session_browser();
	const os = /Windows/.test(userAgent)
		? "Windows"
		: /Android/.test(userAgent)
			? "Android"
			: /iPhone|iPad/.test(userAgent)
				? "iOS"
				: /Mac OS X/.test(userAgent)
					? "macOS"
					: /Linux/.test(userAgent)
						? "Linux"
						: m.session_unknown_os();
	return {
		label: m.session_device({ browser, os }),
		mobile: /Mobi|Android|iPhone/.test(userAgent),
	};
}

export function SessionList({
	currentSessionId,
}: {
	currentSessionId: string;
}) {
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const sessions = useQuery({
		queryKey: ["auth", "sessions"],
		queryFn: async () => {
			const { data, error } = await authClient.listSessions();
			if (error) throw new Error(authErrorMessage(error));
			return data;
		},
	});

	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: ["auth", "sessions"] });

	const revoke = async (token: string) => {
		const { error } = await authClient.revokeSession({ token });
		setStatus(
			error
				? { ok: false, message: authErrorMessage(error) }
				: { ok: true, message: m.session_signed_out() },
		);
		await refresh();
	};

	const revokeOthers = async () => {
		const { error } = await authClient.revokeOtherSessions();
		setStatus(
			error
				? { ok: false, message: authErrorMessage(error) }
				: { ok: true, message: m.session_others_signed_out() },
		);
		await refresh();
	};

	const others = sessions.data?.filter((s) => s.id !== currentSessionId) ?? [];

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">{m.session_intro()}</p>
			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>
			{sessions.isPending ? (
				<p className="text-sm text-muted-foreground">{m.session_loading()}</p>
			) : sessions.isError ? (
				<FormAlert message={sessions.error.message} />
			) : (
				<ul className="divide-y rounded-lg border">
					{sessions.data?.map((s) => {
						const device = describeDevice(s.userAgent);
						const Icon = device.mobile ? Smartphone : Monitor;
						const current = s.id === currentSessionId;
						return (
							<li key={s.id} className="flex items-center gap-3 p-3">
								<Icon className="size-4 shrink-0" aria-hidden="true" />
								<div className="min-w-0 flex-1">
									<p className="flex items-center gap-2 text-sm font-medium">
										{device.label}
										{current ? (
											<Badge variant="secondary">
												{m.session_this_device()}
											</Badge>
										) : null}
									</p>
									<p className="text-xs text-muted-foreground">
										{s.ipAddress ? `${s.ipAddress} · ` : ""}
										{m.session_last_active({
											date: new Date(s.updatedAt).toLocaleString(getLocale()),
										})}
									</p>
								</div>
								{current ? null : (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => revoke(s.token)}
									>
										{m.shell_sign_out()}
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{others.length ? (
				<Button type="button" variant="destructive" onClick={revokeOthers}>
					{m.security_sign_out_others()}
				</Button>
			) : null}
		</div>
	);
}
