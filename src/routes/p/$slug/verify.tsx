import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { PortalCard } from "#/modules/portal/components/PortalBits";
import { getPortalEntry, portalSignIn } from "#/modules/portal/portal";
import { m } from "#/paraglide/messages.js";

// The link from the email. Opening it doesn't sign in: mail scanners open
// links too, and the token works once. The contact presses the button, which
// trades the token for a session.
export const Route = createFileRoute("/p/$slug/verify")({
	validateSearch: z.object({
		token: z.string().max(100).optional().catch(undefined),
	}),
	loader: async ({ params }) => {
		try {
			return await getPortalEntry({ data: { slug: params.slug } });
		} catch (e) {
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	head: () => ({
		meta: [
			{ title: m.portal_sign_in_title() },
			// The link carries a secret: never send it to another site
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	component: VerifyPage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_portal_not_found()}
		</p>
	),
});

function VerifyPage() {
	const router = useRouter();
	const { workspaceName } = Route.useLoaderData();
	const { slug } = Route.useParams();
	const { token } = Route.useSearch();
	const [error, setError] = useState<string | null>(
		token ? null : m.error_portal_link_invalid(),
	);
	const [busy, setBusy] = useState(false);

	return (
		<PortalCard
			workspaceName={workspaceName}
			title={m.portal_verify_title({ workspace: workspaceName })}
			description={m.portal_verify_description()}
		>
			<FormAlert message={error} />
			{token && !error ? (
				<Button
					type="button"
					className="w-full"
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						try {
							await portalSignIn({ data: { slug, token } });
							await router.navigate({ to: "/p/$slug", params: { slug } });
						} catch (e) {
							setError(await serverErrorMessage(e));
							setBusy(false);
						}
					}}
				>
					{busy ? m.portal_signing_in() : m.portal_sign_in_button()}
				</Button>
			) : (
				<Link
					to="/p/$slug/sign-in"
					params={{ slug }}
					className="block text-center text-sm underline-offset-4 hover:underline"
				>
					{m.portal_request_new_link()}
				</Link>
			)}
		</PortalCard>
	);
}
