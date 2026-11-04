import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { Check, Printer, X } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { quoteNumberLabel } from "#/lib/money";
import { DocumentView } from "#/modules/documents/components/DocumentView";
import { localized } from "#/modules/fields/schema";
import { formatValue } from "#/modules/fields/values";
import { PortalShell } from "#/modules/portal/components/PortalBits";
import {
	acceptPortalQuote,
	declinePortalQuote,
	getPortalQuote,
	type PortalQuote,
} from "#/modules/portal/portal";
import { acceptPortalQuoteSchema } from "#/modules/portal/schema";
import { QuoteStatusBadge } from "#/modules/quotes/components/QuoteStatusBadge";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

// One quote in the portal, as it prints, with "Accept" (full name typed and a
// tick) and "Decline" (optional reason) while it is sent and still valid
// (owner decisions 2026-11-04). Who, when and from which IP are recorded.
export const Route = createFileRoute("/p/$slug/quotes/$quoteId")({
	loader: async ({ params }) => {
		try {
			return await getPortalQuote({
				data: { slug: params.slug, id: params.quoteId },
			});
		} catch (e) {
			if (e instanceof Response && e.status === 401)
				throw redirect({
					to: "/p/$slug/sign-in",
					params: { slug: params.slug },
				});
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	head: () => ({ meta: [{ title: m.portal_quotes_title() }] }),
	component: PortalQuotePage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_quote_not_found()}
		</p>
	),
});

function Decision({ q }: { q: PortalQuote }) {
	const when = (value: Date | string | null) =>
		value ? new Date(value).toLocaleString(getLocale()) : "";
	if (q.status === "accepted")
		return (
			<FormAlert
				variant="success"
				message={
					q.decidedVia === "portal" && q.acceptedName
						? m.portal_quote_accepted_by({
								name: q.acceptedName,
								date: when(q.acceptedAt),
							})
						: m.portal_quote_accepted_on({ date: when(q.acceptedAt) })
				}
			/>
		);
	if (q.status === "declined")
		return (
			<FormAlert
				message={
					q.declineReason
						? m.portal_quote_declined_reason({
								date: when(q.declinedAt),
								reason: q.declineReason,
							})
						: m.portal_quote_declined_on({ date: when(q.declinedAt) })
				}
			/>
		);
	if (q.displayStatus === "expired")
		return <FormAlert message={m.portal_quote_expired()} />;
	return null;
}

function Respond({ slug, q }: { slug: string; q: PortalQuote }) {
	const router = useRouter();
	const [mode, setMode] = useState<"accept" | "decline" | null>(null);
	const [name, setName] = useState(q.contactName);
	const [agree, setAgree] = useState(false);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const run = async (action: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await action();
			await router.invalidate();
		} catch (e) {
			setError(await serverErrorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Card className="print:hidden">
			<CardHeader>
				<CardTitle>{m.portal_quote_respond()}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<FormAlert message={error} />
				{mode === null ? (
					<div className="flex flex-wrap gap-2">
						<Button type="button" onClick={() => setMode("accept")}>
							<Check /> {m.portal_quote_accept()}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => setMode("decline")}
						>
							<X /> {m.portal_quote_decline()}
						</Button>
					</div>
				) : null}
				{mode === "accept" ? (
					<form
						noValidate
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							const parsed = acceptPortalQuoteSchema.safeParse({
								slug,
								id: q.id,
								name,
								agree,
								version: q.version,
							});
							if (!parsed.success) {
								setError(parsed.error.issues[0]?.message ?? m.error_generic());
								return;
							}
							void run(() => acceptPortalQuote({ data: parsed.data }));
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="accept-name">
								{m.portal_quote_accept_name()}
							</Label>
							<Input
								id="accept-name"
								value={name}
								maxLength={120}
								autoComplete="name"
								required
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="flex items-start gap-2">
							<Checkbox
								id="accept-agree"
								checked={agree}
								onCheckedChange={(c) => setAgree(c === true)}
							/>
							<Label htmlFor="accept-agree" className="font-normal">
								{m.portal_quote_accept_agree({
									number: quoteNumberLabel(q.number),
								})}
							</Label>
						</div>
						<p className="text-xs text-muted-foreground">
							{m.portal_quote_accept_record()}
						</p>
						<div className="flex gap-2">
							<Button type="submit" disabled={busy}>
								{busy ? m.common_saving() : m.portal_quote_accept_confirm()}
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setMode(null)}
							>
								{m.common_cancel()}
							</Button>
						</div>
					</form>
				) : null}
				{mode === "decline" ? (
					<form
						noValidate
						className="space-y-4"
						onSubmit={(e) => {
							e.preventDefault();
							void run(() =>
								declinePortalQuote({
									data: {
										slug,
										id: q.id,
										reason: reason.trim(),
										version: q.version,
									},
								}),
							);
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="decline-reason">
								{m.portal_quote_decline_reason()}
							</Label>
							<Textarea
								id="decline-reason"
								value={reason}
								maxLength={500}
								rows={3}
								onChange={(e) => setReason(e.target.value)}
							/>
						</div>
						<div className="flex gap-2">
							<Button type="submit" variant="destructive" disabled={busy}>
								{busy ? m.common_saving() : m.portal_quote_decline_confirm()}
							</Button>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setMode(null)}
							>
								{m.common_cancel()}
							</Button>
						</div>
					</form>
				) : null}
			</CardContent>
		</Card>
	);
}

function PortalQuotePage() {
	const { slug } = Route.useParams();
	const { portal, quote: q } = Route.useLoaderData();
	const name = [portal.firstName, portal.lastName].filter(Boolean).join(" ");
	const locale = q.locale === "es" ? "es" : "en";
	const day = (value: Date | string | null) =>
		value
			? new Date(value).toLocaleDateString(locale, { timeZone: "UTC" })
			: "";
	const canRespond = q.status === "sent" && q.displayStatus !== "expired";
	return (
		<PortalShell
			slug={slug}
			workspaceName={portal.workspaceName}
			contactName={name}
		>
			<div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
				<div className="flex items-center gap-3">
					<Link
						to="/p/$slug/quotes"
						params={{ slug }}
						className="text-sm text-muted-foreground hover:underline"
					>
						{m.portal_quotes_back()}
					</Link>
					<QuoteStatusBadge status={q.displayStatus} />
				</div>
				<Button type="button" variant="outline" onClick={() => window.print()}>
					<Printer /> {m.quote_print()}
				</Button>
			</div>
			<Decision q={q} />
			{canRespond ? <Respond slug={slug} q={q} /> : null}
			<DocumentView
				locale={locale}
				title={m.quote_doc_title(
					{ number: quoteNumberLabel(q.number) },
					{ locale },
				)}
				workspaceName={q.workspaceName}
				meta={[
					q.sentAt ? m.quote_doc_date({ date: day(q.sentAt) }, { locale }) : "",
					q.validUntil
						? m.quote_valid_until_text({ date: day(q.validUntil) }, { locale })
						: "",
				].filter(Boolean)}
				party={{
					name: q.contactName,
					company: q.companyName,
					email: q.contactEmail,
				}}
				lines={q.lines.map((l) => ({ ...l, productId: null }))}
				currency={q.currency}
				taxRateBp={q.taxRateBp}
				subtotalCents={q.subtotalCents}
				taxCents={q.taxCents}
				totalCents={q.totalCents}
				notes={q.notes}
			/>
			{q.fields.length ? (
				<Card className="print:hidden">
					<CardContent>
						<dl className="grid gap-3 sm:grid-cols-2">
							{q.fields.map((f) => (
								<div key={f.key}>
									<dt className="text-xs text-muted-foreground">
										{localized(f.label)}
									</dt>
									<dd className="text-sm">
										{formatValue(f, q.custom[f.key], q.fieldCurrency) ||
											m.common_none()}
									</dd>
								</div>
							))}
						</dl>
					</CardContent>
				</Card>
			) : null}
		</PortalShell>
	);
}
