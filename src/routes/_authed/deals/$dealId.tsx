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
	FolderKanban,
	Pencil,
} from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { formatDate } from "#/components/data/ListControls";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { formatMoney } from "#/lib/money";
import { roleCan } from "#/lib/permissions";
import { getContactFormOptions } from "#/modules/contacts/contacts";
import { formatDay, StatusBadge } from "#/modules/deals/components/DealBits";
import { DealFormDialog } from "#/modules/deals/components/DealFormDialog";
import { StageMover } from "#/modules/deals/components/StageMover";
import {
	archiveDeal,
	getDeal,
	restoreDeal,
	updateDeal,
} from "#/modules/deals/deals";
import { type DealStatus, storedToDay } from "#/modules/deals/schema";
import { RelatedDocuments } from "#/modules/documents/components/DocumentBits";
import {
	CustomFieldsView,
	customFieldLabels,
} from "#/modules/fields/components/CustomFields";
import { getRecordFields } from "#/modules/fields/fields";
import { localized } from "#/modules/fields/schema";
import { invoiceRow } from "#/modules/invoices/components/invoiceBits";
import {
	createInvoice,
	listRelatedInvoices,
} from "#/modules/invoices/invoices";
import { orderRow } from "#/modules/orders/components/orderBits";
import { createOrder, listRelatedOrders } from "#/modules/orders/orders";
import { listPipelines } from "#/modules/pipelines/pipelines";
import { RelatedProjects } from "#/modules/projects/components/ProjectBits";
import {
	createProjectFromDeal,
	listRelatedProjects,
} from "#/modules/projects/projects";
import { RelatedQuotes } from "#/modules/quotes/components/RelatedQuotes";
import { listRelatedQuotes } from "#/modules/quotes/quotes";
import { RecordTimeline } from "#/modules/records/components/RecordTimeline";
import { TagEditor } from "#/modules/records/components/TagEditor";
import { getTimeline, listWorkspaceTags } from "#/modules/records/records";
import { RecordWork } from "#/modules/tasks/components/RecordWork";
import { listRecordWork } from "#/modules/tasks/tasks";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/deals/$dealId")({
	loader: async ({ params }) => {
		try {
			const subject = {
				subjectType: "deal" as const,
				subjectId: params.dealId,
			};
			const [
				detail,
				pipelines,
				options,
				timeline,
				allTags,
				fields,
				quotes,
				orders,
				invoices,
				projects,
				work,
			] = await Promise.all([
				getDeal({ data: { id: params.dealId } }),
				listPipelines({ data: { includeArchived: true } }),
				getContactFormOptions(),
				getTimeline({ data: subject }),
				listWorkspaceTags(),
				getRecordFields({ data: { objectKey: "deal" } }),
				listRelatedQuotes({ data: { dealId: params.dealId } }),
				listRelatedOrders({ data: { dealId: params.dealId } }),
				listRelatedInvoices({ data: { dealId: params.dealId } }),
				listRelatedProjects({ data: { dealId: params.dealId } }),
				listRecordWork({ data: subject }),
			]);
			return {
				work,
				...detail,
				pipelines,
				options,
				timeline,
				allTags,
				fields,
				quotes,
				orders,
				invoices,
				projects,
			};
		} catch (e) {
			// Unknown, malformed or another workspace's id: the same "not found"
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	component: DealPage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_deal_not_found()}
		</p>
	),
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div>
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="text-sm">{value || m.common_none()}</dd>
		</div>
	);
}

function DealPage() {
	const router = useRouter();
	const data = Route.useLoaderData();
	const { work } = Route.useLoaderData();
	const {
		deal,
		pipeline,
		pipelines,
		options,
		timeline,
		allTags,
		fields,
		quotes,
		orders,
		invoices,
		projects,
	} = data;
	const navigate = useNavigate();
	const { access, session } = Route.useRouteContext();
	const can = {
		update: roleCan(access?.role, { deal: ["update"] }),
		archive: roleCan(access?.role, { deal: ["delete"] }),
		createQuote: roleCan(access?.role, { quote: ["create"] }),
	};
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const archived = Boolean(deal.archivedAt);
	const money = (cents: number) => formatMoney(cents, fields.currency);

	const toggleArchived = async () => {
		if (
			!archived &&
			!window.confirm(m.deals_archive_confirm({ name: deal.name }))
		)
			return;
		setStatus(null);
		try {
			await (archived ? restoreDeal : archiveDeal)({ data: { id: deal.id } });
			setStatus({
				ok: true,
				message: archived
					? m.deals_restored({ name: deal.name })
					: m.deals_archived({ name: deal.name }),
			});
			await router.invalidate();
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6">
			<Link
				to="/deals"
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
			>
				<ArrowLeft className="size-4" /> {m.deal_back()}
			</Link>

			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-2xl font-bold">{deal.name}</h1>
					<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<StatusBadge status={deal.status as DealStatus} />
						<span className="tabular-nums">{money(deal.valueCents)}</span>
						<Link
							to="/contacts/$contactId"
							params={{ contactId: deal.contactId }}
							className="hover:underline"
						>
							{data.contactName}
						</Link>
						{deal.companyId && data.companyName ? (
							<Link
								to="/companies/$companyId"
								params={{ companyId: deal.companyId }}
								className="hover:underline"
							>
								{data.companyName}
							</Link>
						) : null}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{can.update && !archived && pipeline ? (
						<div className="w-48">
							<StageMover
								dealId={deal.id}
								dealName={deal.name}
								stageId={deal.stageId}
								stages={pipeline.stages}
								onMoved={async (stage) => {
									setStatus({
										ok: true,
										message: m.deal_moved({ name: deal.name, stage }),
									});
									await router.invalidate();
								}}
								onError={(message) => setStatus({ ok: false, message })}
							/>
						</div>
					) : null}
					{deal.status === "won" &&
					!archived &&
					!projects.length &&
					roleCan(access?.role, { project: ["create"] }) ? (
						<Button
							type="button"
							variant="outline"
							onClick={async () => {
								setStatus(null);
								try {
									const { id } = await createProjectFromDeal({
										data: { dealId: deal.id },
									});
									void navigate({
										to: "/projects/$projectId",
										params: { projectId: id },
									});
								} catch (e) {
									setStatus({
										ok: false,
										message: await serverErrorMessage(e),
									});
								}
							}}
						>
							<FolderKanban /> {m.deal_create_project()}
						</Button>
					) : null}
					{can.update && !archived ? (
						<Button type="button" onClick={() => setOpen(true)}>
							<Pencil /> {m.common_edit()}
						</Button>
					) : null}
					{can.archive ? (
						<Button type="button" variant="outline" onClick={toggleArchived}>
							{archived ? <ArchiveRestore /> : <Archive />}
							{archived ? m.common_restore() : m.common_archive()}
						</Button>
					) : null}
				</div>
			</div>

			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>
			{archived ? <FormAlert message={m.common_archived_banner()} /> : null}

			<div className="grid gap-6 lg:grid-cols-3">
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle>{m.deal_details()}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="mb-4 space-y-1.5">
							<p className="text-xs text-muted-foreground">{m.tags_label()}</p>
							<TagEditor
								subjectType="deal"
								subjectId={deal.id}
								tags={timeline.tags}
								allTags={allTags}
								canEdit={can.update && !archived}
								onChanged={() => router.invalidate()}
							/>
						</div>
						<dl className="space-y-3">
							<Field
								label={m.deal_pipeline()}
								value={data.pipelineName ? localized(data.pipelineName) : null}
							/>
							<Field
								label={m.deal_stage()}
								value={data.stageName ? localized(data.stageName) : null}
							/>
							<Field
								label={m.deals_col_value()}
								value={money(deal.valueCents)}
							/>
							<Field
								label={m.deal_expected_close()}
								value={
									deal.expectedCloseAt ? formatDay(deal.expectedCloseAt) : null
								}
							/>
							<Field label={m.common_owner()} value={data.ownerName} />
							{deal.closedAt ? (
								<Field
									label={m.deal_closed_at()}
									value={formatDate(deal.closedAt)}
								/>
							) : null}
							{deal.status === "lost" ? (
								<Field label={m.deal_lost_reason()} value={deal.lostReason} />
							) : null}
							<Field
								label={m.contacts_col_added()}
								value={formatDate(deal.createdAt)}
							/>
						</dl>
						<div className="mt-4">
							<CustomFieldsView fields={fields} custom={deal.custom} />
						</div>
					</CardContent>
				</Card>
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>{m.timeline_title()}</CardTitle>
					</CardHeader>
					<RecordWork
						subjectType="deal"
						subjectId={deal.id}
						label={deal.name}
						work={work}
						role={access?.role}
						archived={archived}
					/>
					<CardContent>
						<RecordTimeline
							subjectType="deal"
							subjectId={deal.id}
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

			<RelatedProjects projects={projects} />
			<RelatedQuotes
				quotes={quotes}
				from={archived ? null : { dealId: deal.id }}
				canCreate={can.createQuote && !archived}
			/>

			<RelatedDocuments
				title={m.orders_title()}
				empty={m.orders_none_here()}
				newLabel={m.orders_new()}
				rows={orders.map(orderRow)}
				to="/orders/$orderId"
				onCreate={
					roleCan(access?.role, { order: ["create"] }) && !archived
						? async () => {
								const { id } = await createOrder({ data: { dealId: deal.id } });
								void navigate({
									to: "/orders/$orderId",
									params: { orderId: id },
								});
							}
						: undefined
				}
			/>
			<RelatedDocuments
				title={m.invoices_title()}
				empty={m.invoices_none_here()}
				newLabel={m.invoices_new()}
				rows={invoices.map(invoiceRow)}
				to="/invoices/$invoiceId"
				onCreate={
					roleCan(access?.role, { invoice: ["create"] }) && !archived
						? async () => {
								const { id } = await createInvoice({
									data: { dealId: deal.id },
								});
								void navigate({
									to: "/invoices/$invoiceId",
									params: { invoiceId: id },
								});
							}
						: undefined
				}
			/>

			{open ? (
				<DealFormDialog
					open
					onOpenChange={setOpen}
					initial={{
						name: deal.name,
						pipelineId: deal.pipelineId,
						stageId: deal.stageId,
						valueCents: deal.valueCents,
						expectedClose: storedToDay(deal.expectedCloseAt),
						contactId: deal.contactId,
						companyId: deal.companyId ?? "",
						ownerId: deal.ownerId ?? "",
						lostReason: deal.lostReason ?? "",
					}}
					initialContact={{
						id: deal.contactId,
						firstName: data.contactName ?? "",
						lastName: null,
					}}
					initialCustom={deal.custom}
					editing
					fields={fields}
					options={{ pipelines, ...options }}
					onSave={async (value) => {
						await updateDeal({ data: { id: deal.id, ...value } });
						setOpen(false);
						setStatus({
							ok: true,
							message: m.deals_updated({ name: value.name }),
						});
						await router.invalidate();
					}}
				/>
			) : null}
		</div>
	);
}
