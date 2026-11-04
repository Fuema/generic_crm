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
	FileText,
	PackageCheck,
	Printer,
	Undo2,
	X,
} from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { orderNumberLabel, quoteNumberLabel } from "#/lib/money";
import { roleCan } from "#/lib/permissions";
import { getContactFormOptions } from "#/modules/contacts/contacts";
import { storedToDay } from "#/modules/deals/schema";
import { DocumentStatusBadge } from "#/modules/documents/components/DocumentBits";
import { DocumentView } from "#/modules/documents/components/DocumentView";
import { DraftEditor } from "#/modules/documents/components/DraftEditor";
import { customFieldLabels } from "#/modules/fields/components/CustomFields";
import { getRecordFields } from "#/modules/fields/fields";
import { createInvoice } from "#/modules/invoices/invoices";
import { orderStatus } from "#/modules/orders/components/orderBits";
import {
	archiveOrder,
	changeOrderStatus,
	getOrder,
	restoreOrder,
	updateOrder,
} from "#/modules/orders/orders";
import type { OrderAction } from "#/modules/orders/schema";
import { pickProducts } from "#/modules/products/products";
import { RecordTimeline } from "#/modules/records/components/RecordTimeline";
import { TagEditor } from "#/modules/records/components/TagEditor";
import { getTimeline, listWorkspaceTags } from "#/modules/records/records";
import { RecordWork } from "#/modules/tasks/components/RecordWork";
import { listRecordWork } from "#/modules/tasks/tasks";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/orders/$orderId")({
	loader: async ({ params }) => {
		try {
			const subject = {
				subjectType: "order" as const,
				subjectId: params.orderId,
			};
			const [detail, options, timeline, allTags, fields, work] =
				await Promise.all([
					getOrder({ data: { id: params.orderId } }),
					getContactFormOptions(),
					getTimeline({ data: subject }),
					listWorkspaceTags(),
					getRecordFields({ data: { objectKey: "order" } }),
					listRecordWork({ data: subject }),
				]);
			const products =
				detail.order.status === "draft" && !detail.order.archivedAt
					? await pickProducts({ data: { q: "" } })
					: [];
			return { work, detail, options, timeline, allTags, fields, products };
		} catch (e) {
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	component: OrderPage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_order_not_found()}
		</p>
	),
});

function OrderPage() {
	const router = useRouter();
	const navigate = useNavigate();
	const { detail, options, timeline, allTags, fields, products } =
		Route.useLoaderData();
	const { work } = Route.useLoaderData();
	const { access, session } = Route.useRouteContext();
	const can = {
		update: roleCan(access?.role, { order: ["update"] }),
		archive: roleCan(access?.role, { order: ["delete"] }),
		invoice: roleCan(access?.role, { invoice: ["create"] }),
	};
	const o = detail.order;
	const number = orderNumberLabel(o.number);
	const archived = Boolean(o.archivedAt);
	const locale = o.locale === "es" ? "es" : "en";
	const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const [busy, setBusy] = useState(false);

	const run = async (action: () => Promise<unknown>, message: string) => {
		setBusy(true);
		setNotice(null);
		try {
			await action();
			setNotice({ ok: true, message });
		} catch (e) {
			setNotice({ ok: false, message: await serverErrorMessage(e) });
		} finally {
			setBusy(false);
			await router.invalidate();
		}
	};
	const act = (action: OrderAction, message: string) =>
		run(() => changeOrderStatus({ data: { id: o.id, action } }), message);

	const contactName = [detail.contactFirstName, detail.contactLastName]
		.filter(Boolean)
		.join(" ");

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6 print:max-w-none print:p-0">
			<div className="space-y-4 print:hidden">
				<Link
					to="/orders"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
				>
					<ArrowLeft className="size-4" /> {m.order_back()}
				</Link>
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="space-y-1">
						<h1 className="text-2xl font-bold">{number}</h1>
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<DocumentStatusBadge {...orderStatus(o.status)} />
							<Link
								to="/contacts/$contactId"
								params={{ contactId: o.contactId }}
								className="hover:underline"
							>
								{contactName}
							</Link>
							{o.dealId && detail.dealName ? (
								<Link
									to="/deals/$dealId"
									params={{ dealId: o.dealId }}
									className="hover:underline"
								>
									{detail.dealName}
								</Link>
							) : null}
							{o.quoteId && detail.quoteNumber ? (
								<Link
									to="/quotes/$quoteId"
									params={{ quoteId: o.quoteId }}
									className="hover:underline"
								>
									{quoteNumberLabel(detail.quoteNumber)}
								</Link>
							) : null}
							{detail.invoiceId ? (
								<Link
									to="/invoices/$invoiceId"
									params={{ invoiceId: detail.invoiceId }}
									className="hover:underline"
								>
									{m.order_see_invoice()}
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
						{can.update && !archived && o.status === "draft" ? (
							<Button
								type="button"
								disabled={busy}
								onClick={() =>
									act("confirm", m.order_confirmed_notice({ number }))
								}
							>
								<Check /> {m.order_confirm()}
							</Button>
						) : null}
						{can.update && !archived && o.status === "confirmed" ? (
							<Button
								type="button"
								disabled={busy}
								onClick={() =>
									act("fulfil", m.order_fulfilled_notice({ number }))
								}
							>
								<PackageCheck /> {m.order_fulfil()}
							</Button>
						) : null}
						{can.invoice &&
						!archived &&
						!detail.invoiceId &&
						(o.status === "confirmed" || o.status === "fulfilled") ? (
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() =>
									run(async () => {
										const { id } = await createInvoice({
											data: { orderId: o.id },
										});
										void navigate({
											to: "/invoices/$invoiceId",
											params: { invoiceId: id },
										});
									}, m.order_invoice_created())
								}
							>
								<FileText /> {m.order_create_invoice()}
							</Button>
						) : null}
						{can.update &&
						!archived &&
						o.status === "confirmed" &&
						!detail.invoiceId ? (
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() =>
									act("reopen", m.order_reopened_notice({ number }))
								}
							>
								<Undo2 /> {m.quote_reopen()}
							</Button>
						) : null}
						{can.update &&
						!archived &&
						(o.status === "draft" || o.status === "confirmed") &&
						!detail.invoiceId ? (
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() => {
									if (window.confirm(m.order_cancel_confirm({ number })))
										void act("cancel", m.order_cancelled_notice({ number }));
								}}
							>
								<X /> {m.order_cancel()}
							</Button>
						) : null}
						{can.archive ? (
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() =>
									run(
										() =>
											(archived ? restoreOrder : archiveOrder)({
												data: { id: o.id },
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
			</div>

			{can.update && !archived && o.status === "draft" ? (
				<DraftEditor
					key={o.id + o.updatedAt.toString()}
					title={m.order_edit_title()}
					draft={{
						contactId: o.contactId,
						contactName,
						companyId: o.companyId,
						ownerId: o.ownerId,
						locale: o.locale,
						taxRateBp: o.taxRateBp,
						notes: o.notes,
						currency: o.currency,
						custom: o.custom,
					}}
					lines={detail.lines}
					date={{ label: m.order_date(), value: storedToDay(o.orderDate) }}
					products={products}
					options={options}
					fields={fields}
					onSave={async (v) => {
						await updateOrder({
							data: {
								id: o.id,
								contactId: v.contactId,
								companyId: v.companyId,
								ownerId: v.ownerId,
								locale: v.locale,
								taxRateBp: v.taxRateBp,
								orderDate: v.date,
								notes: v.notes,
								lines: v.lines,
								custom: v.custom,
							},
						});
						await router.invalidate();
					}}
				/>
			) : null}

			<DocumentView
				locale={locale}
				title={m.order_doc_title({ number }, { locale })}
				workspaceName={detail.workspaceName}
				meta={[
					m.quote_doc_date(
						{
							date: new Date(o.orderDate).toLocaleDateString(locale, {
								timeZone: "UTC",
							}),
						},
						{ locale },
					),
				]}
				party={{
					name: contactName,
					company: detail.companyName,
					email: detail.contactEmail,
				}}
				lines={detail.lines}
				currency={o.currency}
				taxRateBp={o.taxRateBp}
				subtotalCents={o.subtotalCents}
				taxCents={o.taxCents}
				totalCents={o.totalCents}
				notes={o.notes}
			/>

			<div className="grid gap-6 lg:grid-cols-3 print:hidden">
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle>{m.tags_label()}</CardTitle>
					</CardHeader>
					<CardContent>
						<TagEditor
							subjectType="order"
							subjectId={o.id}
							tags={timeline.tags}
							allTags={allTags}
							canEdit={can.update && !archived}
							onChanged={() => router.invalidate()}
						/>
					</CardContent>
				</Card>
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>{m.timeline_title()}</CardTitle>
					</CardHeader>
					<RecordWork
						subjectType="order"
						subjectId={o.id}
						label={number}
						work={work}
						role={access?.role}
						archived={archived}
					/>
					<CardContent>
						<RecordTimeline
							subjectType="order"
							subjectId={o.id}
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
		</div>
	);
}
