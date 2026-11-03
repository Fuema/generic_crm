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
	Merge,
	Pencil,
} from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { formatDate } from "#/components/data/ListControls";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { roleCan } from "#/lib/permissions";
import { ContactFormDialog } from "#/modules/contacts/components/ContactFormDialog";
import { MergeContactDialog } from "#/modules/contacts/components/MergeContactDialog";
import { StageBadge } from "#/modules/contacts/components/StageBadge";
import {
	archiveContact,
	getContact,
	getContactFormOptions,
	restoreContact,
	updateContact,
} from "#/modules/contacts/contacts";
import {
	CONSENT_LABELS,
	type ContactInput,
	contactName,
	type EmailConsent,
} from "#/modules/contacts/schema";
import {
	CustomFieldsView,
	customFieldLabels,
} from "#/modules/fields/components/CustomFields";
import { getRecordFields } from "#/modules/fields/fields";
import { RecordTimeline } from "#/modules/records/components/RecordTimeline";
import { TagEditor } from "#/modules/records/components/TagEditor";
import { getTimeline, listWorkspaceTags } from "#/modules/records/records";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authed/contacts/$contactId")({
	loader: async ({ params }) => {
		try {
			const subject = {
				subjectType: "contact" as const,
				subjectId: params.contactId,
			};
			const [detail, options, timeline, allTags, fields] = await Promise.all([
				getContact({ data: { id: params.contactId } }),
				getContactFormOptions(),
				getTimeline({ data: subject }),
				listWorkspaceTags(),
				getRecordFields({ data: { objectKey: "contact" } }),
			]);
			return { ...detail, options, timeline, allTags, fields };
		} catch (e) {
			// Unknown, malformed or another workspace's id: the same "not found"
			if (e instanceof Response && (e.status === 404 || e.status === 400))
				throw notFound();
			throw e;
		}
	},
	component: ContactPage,
	notFoundComponent: () => (
		<p className="p-6 text-sm text-muted-foreground">
			{m.error_contact_not_found()}
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

function ContactPage() {
	const router = useRouter();
	const { contact, company, ownerName, timeline, allTags, options, fields } =
		Route.useLoaderData();
	const { access, session } = Route.useRouteContext();
	const can = {
		update: roleCan(access?.role, { contact: ["update"] }),
		archive: roleCan(access?.role, { contact: ["delete"] }),
		merge: roleCan(access?.role, { contact: ["update", "delete"] }),
	};
	const [open, setOpen] = useState(false);
	const [merging, setMerging] = useState(false);
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);
	const name = contactName(contact);
	const archived = Boolean(contact.archivedAt);

	const toggleArchived = async () => {
		if (!archived && !window.confirm(m.contacts_archive_confirm({ name })))
			return;
		setStatus(null);
		try {
			await (archived ? restoreContact : archiveContact)({
				data: { id: contact.id },
			});
			setStatus({
				ok: true,
				message: archived
					? m.contacts_restored({ name })
					: m.contacts_archived({ name }),
			});
			await router.invalidate();
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
		}
	};

	const initial: ContactInput = {
		firstName: contact.firstName,
		lastName: contact.lastName ?? "",
		email: contact.email ?? "",
		phone: contact.phone ?? "",
		jobTitle: contact.jobTitle ?? "",
		companyId: contact.companyId ?? "",
		ownerId: contact.ownerId ?? "",
		lifecycleStage: contact.lifecycleStage as ContactInput["lifecycleStage"],
		locale: (contact.locale ?? "") as ContactInput["locale"],
		emailConsent: contact.emailConsent as ContactInput["emailConsent"],
	};

	return (
		<div className="mx-auto max-w-5xl space-y-6 p-6">
			<Link
				to="/contacts"
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
			>
				<ArrowLeft className="size-4" /> {m.contact_back()}
			</Link>

			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-1">
					<h1 className="text-2xl font-bold">{name}</h1>
					<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<StageBadge stage={contact.lifecycleStage} />
						{contact.jobTitle ? <span>{contact.jobTitle}</span> : null}
						{company ? (
							<Link
								to="/companies/$companyId"
								params={{ companyId: company.id }}
								className="hover:underline"
							>
								{company.name}
							</Link>
						) : null}
					</div>
				</div>
				<div className="flex gap-2">
					{can.update && !archived ? (
						<Button type="button" onClick={() => setOpen(true)}>
							<Pencil /> {m.common_edit()}
						</Button>
					) : null}
					{can.merge && !archived ? (
						<Button
							type="button"
							variant="outline"
							onClick={() => setMerging(true)}
						>
							<Merge /> {m.merge_action()}
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
						<CardTitle>{m.contact_details()}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="mb-4 space-y-1.5">
							<p className="text-xs text-muted-foreground">{m.tags_label()}</p>
							<TagEditor
								subjectType="contact"
								subjectId={contact.id}
								tags={timeline.tags}
								allTags={allTags}
								canEdit={can.update && !archived}
								onChanged={() => router.invalidate()}
							/>
						</div>
						<dl className="space-y-3">
							<Field
								label={m.contact_email()}
								value={
									contact.email ? (
										<a
											href={`mailto:${contact.email}`}
											className="hover:underline"
										>
											{contact.email}
										</a>
									) : null
								}
							/>
							<Field label={m.common_phone()} value={contact.phone} />
							<Field label={m.common_owner()} value={ownerName} />
							<Field
								label={m.contact_language()}
								value={
									contact.locale === "es"
										? m.language_es()
										: contact.locale === "en"
											? m.language_en()
											: m.contact_language_default()
								}
							/>
							<Field
								label={m.contact_consent()}
								value={CONSENT_LABELS[contact.emailConsent as EmailConsent]?.()}
							/>
							<Field
								label={m.contacts_col_added()}
								value={formatDate(contact.createdAt)}
							/>
						</dl>
						<div className="mt-4">
							<CustomFieldsView fields={fields} custom={contact.custom} />
						</div>
					</CardContent>
				</Card>
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>{m.timeline_title()}</CardTitle>
					</CardHeader>
					<CardContent>
						<RecordTimeline
							subjectType="contact"
							subjectId={contact.id}
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

			<MergeContactDialog
				open={merging}
				onOpenChange={setMerging}
				contactId={contact.id}
				name={name}
			/>
			<ContactFormDialog
				open={open}
				onOpenChange={setOpen}
				initial={initial}
				editing
				fields={fields}
				initialCustom={contact.custom}
				options={options}
				onSave={async (value) => {
					await updateContact({ data: { id: contact.id, ...value } });
					setOpen(false);
					setStatus({
						ok: true,
						message: m.contacts_updated({ name: contactName(value) }),
					});
					await router.invalidate();
				}}
			/>
		</div>
	);
}
