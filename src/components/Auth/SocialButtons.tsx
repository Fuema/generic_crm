import { useState } from "react";
import { Button } from "#/components/ui/button";
import { authClient, authErrorMessage } from "#/lib/auth-client";
import type { SocialProvider } from "#/lib/auth-providers";
import { m } from "#/paraglide/messages.js";

function GoogleIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="#4285F4"
				d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"
			/>
			<path
				fill="#34A853"
				d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9h-4v3.1A12 12 0 0 0 12 24z"
			/>
			<path
				fill="#FBBC05"
				d="M5.3 14.4a7.2 7.2 0 0 1 0-4.6V6.7h-4a12 12 0 0 0 0 10.8l4-3.1z"
			/>
			<path
				fill="#EA4335"
				d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
			/>
		</svg>
	);
}

function GitHubIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
			<path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.2-3.1-.1-.4-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
		</svg>
	);
}

const PROVIDERS: Record<
	SocialProvider,
	{ label: string; Icon: () => React.JSX.Element }
> = {
	google: { label: "Google", Icon: GoogleIcon },
	github: { label: "GitHub", Icon: GitHubIcon },
};

export function SocialButtons({
	providers,
	callbackURL,
	onError,
}: {
	providers: SocialProvider[];
	callbackURL: string;
	onError: (message: string) => void;
}) {
	const [pending, setPending] = useState<SocialProvider | null>(null);

	if (!providers.length) return null;

	const signIn = async (provider: SocialProvider) => {
		setPending(provider);
		const { error } = await authClient.signIn.social({
			provider,
			callbackURL,
			errorCallbackURL: "/login?error=social",
		});
		// On success the browser is already redirecting to the provider
		if (error) {
			onError(authErrorMessage(error));
			setPending(null);
		}
	};

	return (
		<div
			className={`grid gap-3 ${providers.length > 1 ? "sm:grid-cols-2" : ""}`}
		>
			{providers.map((id) => {
				const { label, Icon } = PROVIDERS[id];
				return (
					<Button
						key={id}
						type="button"
						variant="outline"
						disabled={pending !== null}
						onClick={() => signIn(id)}
					>
						<Icon />
						{pending === id ? m.common_redirecting() : label}
					</Button>
				);
			})}
		</div>
	);
}
