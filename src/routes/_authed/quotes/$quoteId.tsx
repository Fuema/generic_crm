import {
	createFileRoute,
	Link,
	notFound,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import {
	Archive,
	ArchiveRestore,
	ArrowLeft,
	Check,
	Mail,
	Printer,
	Send,
	ShoppingCart,
	Undo2,
	X,
} from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { orderNumberLabel, quoteNumberLabel } from "#/lib/money";
import { roleCan } from "#/lib/permissions";
import { getContactFormOptions } from "#/modules/contacts/contacts";
import { moveDeal } from "#/modules/deals/deals";
import { customFieldLabels } from "#/modules/fields/components/CustomFields";
import { getRecordFields } from "#/modules/fields/fields";
import { createOrder, listRelatedOrders } from "#/modules/orders/orders";
import { listPipelines } from "#/modules/pipelines/pipelines";
import { pickProducts } from "#/modules/products/products";
import { QuoteDocument } from "#/modules/quotes/components/QuoteDocument";
import { QuoteEditor } from "#/modules/quotes/components/QuoteEditor";
import { QuoteStatusBadge } from "#/modules/quotes/components/QuoteStatusBadge";
import {
	acceptQuote,
	archiveQuote,
	declineQuote,
	getQuote,
	reopenQuote,
	restoreQuote,
	sendQuote,
} from "#/modules/quotes/quotes";
import { RecordTimeline } from "#/modules/records/components/RecordTimeline";
import { TagEditor } from "#/modules/records/components/TagEditor";
import { getTimeline, listWorkspaceTags } from "#/modules/records/records";
import { RecordWork } from "#/modules/tasks/components/RecordWork";
import { listRecordWork } from "#/modules/tasks/tasks";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/quotes/$quoteId")({
	loader: async ({ params }) => {
		try {
			const subject = {
				subjectType: "quote" as const,
				subjectId: params.quoteId,
			};
			const [detail, options, timeline, allTags, fields, orders, work] =
				await Promise.all([
					getQuote({ data: { id: params.quoteId } }),
					getContactFormOptions(),
					getTimeline({ data: subject }),
					listWorkspaceTags(),
					getRecordFields({ data: { objectKey: "quote" } }),
					listRelatedOrders({ data: { quoteId: params.quoteId } }),
					listRecordWork({ data: subject }),
				]);
			// The catalog only matters while the quote can be edited
			const products =
				detail.quote.status === "draft" && !detail.quote.archivedAt
					? await pickProducts({ data: { q: "" } })
					: [];
			return {
				work,
				detail,
				options,
				timeline,
				allTags,
				fields,
				products,
				orders,
			};
		} catch (e) {
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	component: QuotePage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_quote_not_found()}
		</p>
	),
});

function QuotePage() {
	const router = useRouter();
	const { detail, options, timeline, allTags, fields, products, orders } =
		Route.useLoaderData();
	const { work } = Route.useLoaderData();
	const navigate = useNavigate();
	const order = orders[0] ?? null;
	const { access, session } = Route.useRouteContext();
	const can = {
		update: roleCan(access?.role, { quote: ["update"] }),
		archive: roleCan(access?.role, { quote: ["delete"] }),
		moveDeal: roleCan(access?.role, { deal: ["update"] }),
		createOrder: roleCan(access?.role, { order: ["create"] }),
	};
	const q = detail.quote;
	const number = quoteNumberLabel(q.number);
	const archived = Boolean(q.archivedAt);
	const status = q.displayStatus;
	const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const [busy, setBusy] = useState(false);
	const [sending, setSending] = useState(false);
	const [declining, setDeclining] = useState(false);
	const [reason, setReason] = useState("");
	const [offerWin, setOfferWin] = useState(false);

	const run = async (action: () => Promise<unknown>, message: string) => {
		setBusy(true);
		setNotice(null);
		try {
			await action();
			setNotice({ ok: true, message });
			await router.invalidate();
			return true;
		} catch (e) {
			setNotice({ ok: false, message: await serverErrorMessage(e) });
			await router.invalidate();
			return false;
		} finally {
			setBusy(false);
		}
	};

	const markDealWon = async () => {
		if (!q.dealId || !detail.dealPipelineId) return;
		setOfferWin(false);
		await run(
			async () => {
				const pipelines = await listPipelines({
					data: { includeArchived: true },
				});
				const won = pipelines
					.find((p) => p.id === detail.dealPipelineId)
					?.stages.find((s) => s.type === "won");
				if (!won) throw new Response(m.error_choose_stage(), { status: 400 });
				await moveDeal({
					data: { id: q.dealId as string, stageId: won.id, lostReason: "" },
				});
			},
			m.quote_deal_marked_won({ name: detail.dealName ?? "" }),
		);
	};

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6 print:max-w-none print:p-0">
			<div className="space-y-4 print:hidden">
				<Link
					to="/quotes"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
				>
					<ArrowLeft className="size-4" /> {m.quote_back()}
				</Link>
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="space-y-1">
						<h1 className="text-2xl font-bold">{number}</h1>
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<QuoteStatusBadge status={status} />
							<Link
								to="/contacts/$contactId"
								params={{ contactId: q.contactId }}
								className="hover:underline"
							>
								{[detail.contactFirstName, detail.contactLastName]
									.filter(Boolean)
									.join(" ")}
							</Link>
							{q.dealId && detail.dealName ? (
								<Link
									to="/deals/$dealId"
									params={{ dealId: q.dealId }}
									className="hover:underline"
								>
									{detail.dealName}
								</Link>
							) : null}
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => window.print()}
						>
							<Printer /> {m.quote_print()}
						</Button>
						{order ? (
							<Button asChild variant="outline">
								<Link to="/orders/$orderId" params={{ orderId: order.id }}>
									<ShoppingCart /> {orderNumberLabel(order.number)}
								</Link>
							</Button>
						) : can.createOrder && !archived && status === "accepted" ? (
							<Button
								type="button"
								disabled={busy}
								onClick={() =>
									run(async () => {
										const { id } = await createOrder({
											data: { quoteId: q.id },
										});
										void navigate({
											to: "/orders/$orderId",
											params: { orderId: id },
										});
									}, m.quote_order_created())
								}
							>
								<ShoppingCart /> {m.quote_create_order()}
							</Button>
						) : null}
						{can.update && !archived && status === "draft" ? (
							<Button
								type="button"
								disabled={busy}
								onClick={() => setSending(true)}
							>
								<Send /> {m.quote_send()}
							</Button>
						) : null}
						{can.update && !archived && status === "sent" ? (
							<Button
								type="button"
								disabled={busy}
								onClick={async () => {
									const ok = await run(
										() => acceptQuote({ data: { id: q.id } }),
										m.quote_accepted_notice({ number }),
									);
									if (
										ok &&
										q.dealId &&
										detail.dealStatus === "open" &&
										can.moveDeal
									)
										setOfferWin(true);
								}}
							>
								<Check /> {m.quote_accept()}
							</Button>
						) : null}
						{can.update &&
						!archived &&
						(status === "sent" || status === "expired") ? (
							<>
								<Button
									type="button"
									variant="outline"
									disabled={busy}
									onClick={() => {
										setReason("");
										setDeclining(true);
									}}
								>
									<X /> {m.quote_decline()}
								</Button>
								<Button
									type="button"
									variant="outline"
									disabled={busy}
									onClick={() =>
										run(
											() => reopenQuote({ data: { id: q.id } }),
											m.quote_reopened_notice({ number }),
										)
									}
								>
									<Undo2 /> {m.quote_reopen()}
								</Button>
							</>
						) : null}
						{can.archive ? (
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() =>
									run(
										() =>
											(archived ? restoreQuote : archiveQuote)({
												data: { id: q.id },
											}),
										archived
											? m.quote_restored_notice({ number })
											: m.quote_archived_notice({ number }),
									)
								}
							>
								{archived ? <ArchiveRestore /> : <Archive />}
								{archived ? m.common_restore() : m.common_archive()}
							</Button>
						) : null}
					</div>
				</div>
				<FormAlert
					message={notice?.message ?? null}
					variant={notice?.ok ? "success" : "destructive"}
				/>
				{archived ? <FormAlert message={m.common_archived_banner()} /> : null}
				{status === "expired" ? (
					<FormAlert message={m.quote_expired_banner()} />
				) : null}
				{offerWin ? (
					<div className="flex flex-wrap items-center gap-3 rounded-md border bg-background p-3 text-sm">
						<span className="flex-1">
							{m.quote_offer_win({ name: detail.dealName ?? "" })}
						</span>
						<Button type="button" size="sm" onClick={markDealWon}>
							{m.quote_mark_deal_won()}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => setOfferWin(false)}
						>
							{m.common_cancel()}
						</Button>
					</div>
				) : null}
			</div>

			{can.update && !archived && status === "draft" ? (
				<QuoteEditor
					key={q.id + String(q.totalCents) + timeline.events.length}
					detail={detail}
					products={products}
					options={options}
					fields={fields}
					onSaved={() => router.invalidate()}
				/>
			) : null}

			<QuoteDocument detail={detail} />

			<div className="grid gap-6 lg:grid-cols-3 print:hidden">
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle>{m.tags_label()}</CardTitle>
					</CardHeader>
					<CardContent>
						<TagEditor
							subjectType="quote"
							subjectId={q.id}
							tags={timeline.tags}
							allTags={allTags}
							canEdit={can.update && !archived}
							onChanged={() => router.invalidate()}
						/>
						{q.declineReason ? (
							<p className="mt-4 text-sm">
								<span className="block text-xs text-muted-foreground">
									{m.quote_decline_reason()}
								</span>
								{q.declineReason}
							</p>
						) : null}
					</CardContent>
				</Card>
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>{m.timeline_title()}</CardTitle>
					</CardHeader>
					<RecordWork
						subjectType="quote"
						subjectId={q.id}
						label={number}
						work={work}
						role={access?.role}
						archived={archived}
					/>
					<CardContent>
						<RecordTimeline
							subjectType="quote"
							subjectId={q.id}
							timeline={timeline}
							canWrite={can.update && !archived}
							canDeleteAny={can.archive}
							currentUserId={session.user.id}
							fieldLabels={customFieldLabels(fields)}
							onChanged={() => router.invalidate()}
						/>
					</CardContent>
				</Card>
			</div>

			<Dialog open={sending} onOpenChange={setSending}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{m.quote_send_title({ number })}</DialogTitle>
						<DialogDescription>
							{detail.contactEmail
								? m.quote_send_description({ email: detail.contactEmail })
								: m.quote_send_no_email()}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="ghost"
							onClick={() => setSending(false)}
						>
							{m.common_cancel()}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={busy}
							onClick={async () => {
								setSending(false);
								await run(
									() => sendQuote({ data: { id: q.id, email: false } }),
									m.quote_marked_sent_notice({ number }),
								);
							}}
						>
							<Check /> {m.quote_mark_sent()}
						</Button>
						<Button
							type="button"
							disabled={busy || !detail.contactEmail}
							onClick={async () => {
								setSending(false);
								await run(
									() => sendQuote({ data: { id: q.id, email: true } }),
									m.quote_emailed_notice({ number }),
								);
							}}
						>
							<Mail /> {m.quote_send_email()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={declining} onOpenChange={setDeclining}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{m.quote_decline_title({ number })}</DialogTitle>
						<DialogDescription>
							{m.quote_decline_description()}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="quote-decline-reason">
							{m.quote_decline_reason()}
						</Label>
						<Textarea
							id="quote-decline-reason"
							value={reason}
							maxLength={500}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => setDeclining(false)}
						>
							{m.common_cancel()}
						</Button>
						<Button
							type="button"
							disabled={busy}
							onClick={async () => {
								setDeclining(false);
								await run(
									() => declineQuote({ data: { id: q.id, reason } }),
									m.quote_declined_notice({ number }),
								);
							}}
						>
							{m.quote_decline()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
