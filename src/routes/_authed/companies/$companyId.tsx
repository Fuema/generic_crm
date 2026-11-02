import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { Archive, ArchiveRestore, ArrowLeft, Pencil } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { formatDate } from "#/components/data/ListControls";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { countryName } from "#/lib/countries";
import { roleCan } from "#/lib/permissions";
import { CompanyFormDialog } from "#/modules/contacts/components/CompanyFormDialog";
import { StageBadge } from "#/modules/contacts/components/StageBadge";
import {
	archiveCompany,
	getCompany,
	getContactFormOptions,
	restoreCompany,
	updateCompany,
} from "#/modules/contacts/contacts";
import { type CompanyInput, contactName } from "#/modules/contacts/schema";
import { RecordTimeline } from "#/modules/records/components/RecordTimeline";
import { TagEditor } from "#/modules/records/components/TagEditor";
import { getTimeline, listWorkspaceTags } from "#/modules/records/records";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/companies/$companyId")({
	loader: async ({ params }) => {
		try {
			const subject = {
				subjectType: "company" as const,
				subjectId: params.companyId,
			};
			const [detail, options, timeline, allTags] = await Promise.all([
				getCompany({ data: { id: params.companyId } }),
				getContactFormOptions(),
				getTimeline({ data: subject }),
				listWorkspaceTags(),
			]);
			return { ...detail, members: options.members, timeline, allTags };
		} catch (e) {
			// Unknown, malformed or another workspace's id: the same "not found"
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	component: CompanyPage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_company_not_found()}
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

function CompanyPage() {
	const router = useRouter();
	const { company, ownerName, contacts, timeline, allTags, members } =
		Route.useLoaderData();
	const { access, session } = Route.useRouteContext();
	const can = {
		update: roleCan(access?.role, { company: ["update"] }),
		archive: roleCan(access?.role, { company: ["delete"] }),
	};
	const [open, setOpen] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const archived = Boolean(company.archivedAt);

	const toggleArchived = async () => {
		const name = company.name;
		if (!archived && !window.confirm(m.companies_archive_confirm({ name })))
			return;
		setStatus(null);
		try {
			await (archived ? restoreCompany : archiveCompany)({
				data: { id: company.id },
			});
			setStatus({
				ok: true,
				message: archived
					? m.companies_restored({ name })
					: m.companies_archived({ name }),
			});
			await router.invalidate();
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	const initial: CompanyInput = {
		name: company.name,
		domain: company.domain ?? "",
		phone: company.phone ?? "",
		city: company.city ?? "",
		country: company.country ?? "",
		ownerId: company.ownerId ?? "",
	};

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6">
			<Link
				to="/companies"
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
			>
				<ArrowLeft className="size-4" /> {m.company_back()}
			</Link>

			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-2xl font-bold">{company.name}</h1>
					{company.domain ? (
						<p className="text-sm text-muted-foreground">{company.domain}</p>
					) : null}
				</div>
				<div className="flex gap-2">
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
				<Card>
					<CardHeader>
						<CardTitle>{m.contact_details()}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="mb-4 space-y-1.5">
							<p className="text-xs text-muted-foreground">{m.tags_label()}</p>
							<TagEditor
								subjectType="company"
								subjectId={company.id}
								tags={timeline.tags}
								allTags={allTags}
								canEdit={can.update && !archived}
								onChanged={() => router.invalidate()}
							/>
						</div>
						<dl className="space-y-3">
							<Field label={m.common_phone()} value={company.phone} />
							<Field
								label={m.companies_col_location()}
								value={[company.city, countryName(company.country)]
									.filter(Boolean)
									.join(", ")}
							/>
							<Field label={m.common_owner()} value={ownerName} />
							<Field
								label={m.contacts_col_added()}
								value={formatDate(company.createdAt)}
							/>
						</dl>
					</CardContent>
				</Card>
				<div className="space-y-6 lg:col-span-2">
					<Card>
						<CardHeader>
							<CardTitle>{m.company_contacts()}</CardTitle>
						</CardHeader>
						<CardContent>
							{contacts.length ? (
								<ul className="divide-y">
									{contacts.map((c) => (
										<li
											key={c.id}
											className="flex flex-wrap items-center gap-3 py-2"
										>
											<div className="min-w-0 flex-1">
												<Link
													to="/contacts/$contactId"
													params={{ contactId: c.id }}
													className="font-medium hover:underline"
												>
													{contactName(c)}
												</Link>
												<p className="truncate text-xs text-muted-foreground">
													{[c.jobTitle, c.email].filter(Boolean).join(" · ")}
												</p>
											</div>
											<StageBadge stage={c.lifecycleStage} />
										</li>
									))}
								</ul>
							) : (
								<p className="text-sm text-muted-foreground">
									{m.company_no_contacts()}
								</p>
							)}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>{m.timeline_title()}</CardTitle>
						</CardHeader>
						<CardContent>
							<RecordTimeline
								subjectType="company"
								subjectId={company.id}
								timeline={timeline}
								canWrite={can.update && !archived}
								canDeleteAny={can.archive}
								currentUserId={session.user.id}
								onChanged={() => router.invalidate()}
							/>
						</CardContent>
					</Card>
				</div>
			</div>

			<CompanyFormDialog
				open={open}
				onOpenChange={setOpen}
				initial={initial}
				editing
				members={members}
				onSave={async (value) => {
					await updateCompany({ data: { id: company.id, ...value } });
					setOpen(false);
					setStatus({
						ok: true,
						message: m.companies_updated({ name: value.name }),
					});
					await router.invalidate();
				}}
			/>
		</div>
	);
}
