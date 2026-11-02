import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import { FormAlert } from "../FormParts";

// Very small user-agent summary, enough to recognise a device
function describeDevice(userAgent?: string | null) {
	if (!userAgent) return { label: "Unknown device", mobile: false };
	const browser = /Edg\//.test(userAgent)
		? "Edge"
		: /Firefox\//.test(userAgent)
			? "Firefox"
			: /Chrome\//.test(userAgent)
				? "Chrome"
				: /Safari\//.test(userAgent)
					? "Safari"
					: "Browser";
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
						: "Unknown OS";
	return {
		label: `${browser} on ${os}`,
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
				: { ok: true, message: "Device signed out." },
		);
		await refresh();
	};

	const revokeOthers = async () => {
		const { error } = await authClient.revokeOtherSessions();
		setStatus(
			error
				? { ok: false, message: authErrorMessage(error) }
				: { ok: true, message: "All other devices signed out." },
		);
		await refresh();
	};

	const others = sessions.data?.filter((s) => s.id !== currentSessionId) ?? [];

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				These devices are signed in to your account. Sign out any you don't
				recognise, then change your password.
			</p>
			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>
			{sessions.isPending ? (
				<p className="text-sm text-muted-foreground">Loading devices...</p>
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
											<Badge variant="secondary">This device</Badge>
										) : null}
									</p>
									<p className="text-xs text-muted-foreground">
										{s.ipAddress ? `${s.ipAddress} · ` : ""}Last active{" "}
										{new Date(s.updatedAt).toLocaleString()}
									</p>
								</div>
								{current ? null : (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => revoke(s.token)}
									>
										Sign out
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{others.length ? (
				<Button type="button" variant="destructive" onClick={revokeOthers}>
					Sign out of all other devices
				</Button>
			) : null}
		</div>
	);
}
