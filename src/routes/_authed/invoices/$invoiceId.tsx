import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import {
	Archive,
	ArchiveRestore,
	ArrowLeft,
	Ban,
	Mail,
	Printer,
	Stamp,
} from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { orderNumberLabel } from "#/lib/money";
import { roleCan } from "#/lib/permissions";
import { getContactFormOptions } from "#/modules/contacts/contacts";
import { DocumentStatusBadge } from "#/modules/documents/components/DocumentBits";
import { DocumentView } from "#/modules/documents/components/DocumentView";
import { DraftEditor } from "#/modules/documents/components/DraftEditor";
import { customFieldLabels } from "#/modules/fields/components/CustomFields";
import { getRecordFields } from "#/modules/fields/fields";
import {
	invoiceStatus,
	invoiceTitle,
} from "#/modules/invoices/components/invoiceBits";
import {
	archiveInvoice,
	getInvoice,
	issueInvoice,
	restoreInvoice,
	sendInvoice,
	updateInvoice,
	voidInvoice,
} from "#/modules/invoices/invoices";
import { invoiceLabel } from "#/modules/invoices/schema";
import { PaymentsCard } from "#/modules/payments/components/PaymentsCard";
import { listPayments } from "#/modules/payments/payments";
import { pickProducts } from "#/modules/products/products";
import { RecordTimeline } from "#/modules/records/components/RecordTimeline";
import { TagEditor } from "#/modules/records/components/TagEditor";
import { getTimeline, listWorkspaceTags } from "#/modules/records/records";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/invoices/$invoiceId")({
	loader: async ({ params }) => {
		try {
			const subject = {
				subjectType: "invoice" as const,
				subjectId: params.invoiceId,
			};
			const [detail, options, timeline, allTags, fields, payments] =
				await Promise.all([
					getInvoice({ data: { id: params.invoiceId } }),
					getContactFormOptions(),
					getTimeline({ data: subject }),
					listWorkspaceTags(),
					getRecordFields({ data: { objectKey: "invoice" } }),
					listPayments({ data: { invoiceId: params.invoiceId } }),
				]);
			const products =
				detail.invoice.status === "draft" && !detail.invoice.archivedAt
					? await pickProducts({ data: { q: "" } })
					: [];
			return { detail, options, timeline, allTags, fields, products, payments };
		} catch (e) {
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	component: InvoicePage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_invoice_not_found()}
		</p>
	),
});

function InvoicePage() {
	const router = useRouter();
	const { detail, options, timeline, allTags, fields, products, payments } =
		Route.useLoaderData();
	const { access, session } = Route.useRouteContext();
	const can = {
		update: roleCan(access?.role, { invoice: ["update"] }),
		issue: roleCan(access?.role, { invoice: ["issue"] }),
		void: roleCan(access?.role, { invoice: ["void"] }),
		pay: roleCan(access?.role, { invoice: ["pay"] }),
		archive: roleCan(access?.role, { invoice: ["delete"] }),
	};
	const inv = detail.invoice;
	const title = invoiceTitle(inv.year, inv.number);
	const archived = Boolean(inv.archivedAt);
	const locale = inv.locale === "es" ? "es" : "en";
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

	const contactName = [detail.contactFirstName, detail.contactLastName]
		.filter(Boolean)
		.join(" ");
	const day = (value: Date | null) =>
		value
			? new Date(value).toLocaleDateString(locale, { timeZone: "UTC" })
			: "";
	const docNumber = invoiceLabel(inv.year, inv.number);

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6 print:max-w-none print:p-0">
			<div className="space-y-4 print:hidden">
				<Link
					to="/invoices"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
				>
					<ArrowLeft className="size-4" /> {m.invoice_back()}
				</Link>
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div className="space-y-1">
						<h1 className="text-2xl font-bold">{title}</h1>
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<DocumentStatusBadge {...invoiceStatus(inv.displayStatus)} />
							<Link
								to="/contacts/$contactId"
								params={{ contactId: inv.contactId }}
								className="hover:underline"
							>
								{contactName}
							</Link>
							{inv.orderId && detail.orderNumber ? (
								<Link
									to="/orders/$orderId"
									params={{ orderId: inv.orderId }}
									className="hover:underline"
								>
									{orderNumberLabel(detail.orderNumber)}
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
						{can.issue && !archived && inv.status === "draft" ? (
							<Button
								type="button"
								disabled={busy}
								onClick={() => {
									if (window.confirm(m.invoice_issue_confirm()))
										void run(
											() => issueInvoice({ data: { id: inv.id } }),
											m.invoice_issued_notice(),
										);
								}}
							>
								<Stamp /> {m.invoice_issue()}
							</Button>
						) : null}
						{can.issue &&
						!archived &&
						(inv.status === "issued" || inv.status === "partially_paid") ? (
							<Button
								type="button"
								variant="outline"
								disabled={busy || !detail.contactEmail}
								title={
									detail.contactEmail ? undefined : m.quote_send_no_email()
								}
								onClick={() =>
									run(
										() => sendInvoice({ data: { id: inv.id } }),
										m.invoice_emailed_notice({
											email: detail.contactEmail ?? "",
										}),
									)
								}
							>
								<Mail /> {m.quote_send_email()}
							</Button>
						) : null}
						{can.void &&
						!archived &&
						(inv.status === "draft" || inv.status === "issued") ? (
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() => {
									if (window.confirm(m.invoice_void_confirm()))
										void run(
											() => voidInvoice({ data: { id: inv.id } }),
											m.invoice_voided_notice(),
										);
								}}
							>
								<Ban /> {m.invoice_void()}
							</Button>
						) : null}
						{can.archive &&
						(archived ||
							inv.status === "void" ||
							(inv.status === "draft" && !inv.orderId)) ? (
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() =>
									run(
										() =>
											(archived ? restoreInvoice : archiveInvoice)({
												data: { id: inv.id },
											}),
										archived
											? m.quote_restored_notice({ number: title })
											: m.quote_archived_notice({ number: title }),
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
				{inv.displayStatus === "overdue" ? (
					<FormAlert message={m.invoice_overdue_banner()} />
				) : null}
			</div>

			{can.update && !archived && inv.status === "draft" ? (
				<DraftEditor
					key={inv.id + inv.updatedAt.toString()}
					title={m.invoice_edit_title()}
					draft={{
						contactId: inv.contactId,
						contactName,
						companyId: inv.companyId,
						ownerId: inv.ownerId,
						locale: inv.locale,
						taxRateBp: inv.taxRateBp,
						notes: inv.notes,
						currency: inv.currency,
						custom: inv.custom,
					}}
					lines={detail.lines}
					locked={Boolean(inv.orderId)}
					products={products}
					options={options}
					fields={fields}
					onSave={async (v) => {
						await updateInvoice({
							data: {
								id: inv.id,
								contactId: v.contactId,
								companyId: v.companyId,
								ownerId: v.ownerId,
								locale: v.locale,
								taxRateBp: v.taxRateBp,
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
				title={
					docNumber
						? m.invoice_doc_title({ number: docNumber }, { locale })
						: m.invoice_doc_draft({}, { locale })
				}
				workspaceName={detail.workspaceName}
				meta={[
					inv.issueDate
						? m.invoice_issued_text({ date: day(inv.issueDate) }, { locale })
						: "",
					inv.dueDate
						? m.invoice_due_text({ date: day(inv.dueDate) }, { locale })
						: "",
				]}
				party={{
					name: contactName,
					company: detail.companyName,
					email: detail.contactEmail,
				}}
				lines={detail.lines}
				currency={inv.currency}
				taxRateBp={inv.taxRateBp}
				subtotalCents={inv.subtotalCents}
				taxCents={inv.taxCents}
				totalCents={inv.totalCents}
				notes={inv.notes}
			/>

			{inv.status !== "draft" && inv.status !== "void" ? (
				<PaymentsCard
					invoiceId={inv.id}
					currency={inv.currency}
					totalCents={inv.totalCents}
					paidCents={inv.paidCents}
					payments={payments}
					canRecord={can.update && !archived}
					canDecide={can.pay && !archived}
					onChanged={async (message) => {
						setNotice({ ok: true, message });
						await router.invalidate();
					}}
				/>
			) : null}

			<div className="grid gap-6 lg:grid-cols-3 print:hidden">
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle>{m.tags_label()}</CardTitle>
					</CardHeader>
					<CardContent>
						<TagEditor
							subjectType="invoice"
							subjectId={inv.id}
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
					<CardContent>
						<RecordTimeline
							subjectType="invoice"
							subjectId={inv.id}
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
