import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { emailSchema } from "#/lib/schema";
import { PortalCard } from "#/modules/portal/components/PortalBits";
import { getPortalEntry, requestPortalLink } from "#/modules/portal/portal";
import { m } from "#/paraglide/messages.js";

// Customer portal sign-in (spec §8): the contact asks for a one-time link.
// The answer is the same whether or not the address has access.
export const Route = createFileRoute("/p/$slug/sign-in")({
	loader: async ({ params }) => {
		let entry: Awaited<ReturnType<typeof getPortalEntry>>;
		try {
			entry = await getPortalEntry({ data: { slug: params.slug } });
		} catch (e) {
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
		if (entry.signedIn)
			throw redirect({ to: "/p/$slug", params: { slug: params.slug } });
		return entry;
	},
	head: () => ({ meta: [{ title: m.portal_sign_in_title() }] }),
	component: SignInPage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_portal_not_found()}
		</p>
	),
});

function SignInPage() {
	const { workspaceName } = Route.useLoaderData();
	const { slug } = Route.useParams();
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [sent, setSent] = useState(false);
	const [busy, setBusy] = useState(false);

	return (
		<PortalCard
			workspaceName={workspaceName}
			title={m.portal_sign_in_title()}
			description={m.portal_sign_in_description()}
		>
			{sent ? (
				<FormAlert message={m.portal_link_sent()} variant="success" />
			) : (
				<form
					noValidate
					className="space-y-4"
					onSubmit={async (e) => {
						e.preventDefault();
						const parsed = emailSchema.safeParse(email);
						if (!parsed.success) {
							setError(parsed.error.issues[0].message);
							return;
						}
						setError(null);
						setBusy(true);
						try {
							await requestPortalLink({ data: { slug, email: parsed.data } });
							setSent(true);
						} catch (err) {
							setError(await serverErrorMessage(err));
						} finally {
							setBusy(false);
						}
					}}
				>
					<FormAlert message={error} />
					<div className="space-y-2">
						<Label htmlFor="portal-email">{m.common_email()}</Label>
						<Input
							id="portal-email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
						/>
					</div>
					<Button type="submit" className="w-full" disabled={busy}>
						{busy ? m.common_sending() : m.portal_send_link()}
					</Button>
				</form>
			)}
		</PortalCard>
	);
}
