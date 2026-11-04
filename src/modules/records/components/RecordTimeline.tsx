import { Link } from "@tanstack/react-router";
import { History, Pencil, Pin, PinOff, StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { orderNumberLabel, quoteNumberLabel } from "#/lib/money";
import { invoiceLabel } from "#/modules/invoices/schema";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import {
	createNote,
	deleteNote,
	type Timeline,
	type TimelineEvent,
	type TimelineNote,
	updateNote,
} from "../records";
import { LIMITS, type SubjectType } from "../schema";

type Filter = "all" | "notes" | "changes";

// Labels for the fields that can appear in a change event
const FIELD_LABELS: Record<string, () => string> = {
	firstName: m.contact_first_name,
	lastName: m.contact_last_name,
	email: m.contact_email,
	phone: m.common_phone,
	jobTitle: m.contact_job_title,
	companyId: m.contact_company,
	ownerId: m.common_owner,
	lifecycleStage: m.contact_stage,
	locale: m.contact_language,
	emailConsent: m.contact_consent,
	name: m.company_name,
	domain: m.company_domain,
	city: m.common_city,
	country: m.common_country,
	valueCents: m.deals_col_value,
	expectedCloseAt: m.deal_expected_close,
	contactId: m.deal_contact,
	lostReason: m.deal_lost_reason,
};

function describe(e: TimelineEvent, fieldLabels: Record<string, string>) {
	const kind = e.type.split(".").pop();
	const payload = e.payload as {
		changes?: Record<string, unknown>;
		name?: string;
		role?: "kept" | "duplicate";
		otherName?: string;
		toName?: string;
		reason?: string | null;
		fields?: string[];
		email?: boolean;
	};
	switch (kind) {
		case "created":
			return m.event_created();
		case "archived":
			return m.event_archived();
		case "restored":
			return m.event_restored();
		case "tag_added":
			return m.event_tag_added({ name: payload.name ?? "" });
		case "tag_removed":
			return m.event_tag_removed({ name: payload.name ?? "" });
		case "note_deleted":
			return m.event_note_deleted();
		case "note_pinned":
			return m.event_note_pinned();
		case "note_unpinned":
			return m.event_note_unpinned();
		case "stage_changed":
			return m.event_stage_changed({ stage: payload.toName ?? "" });
		case "won":
			return m.event_deal_won();
		case "lost":
			return payload.reason
				? m.event_deal_lost_reason({ reason: payload.reason })
				: m.event_deal_lost();
		case "reopened":
			return /^(quote|order)\./.test(e.type)
				? m.event_quote_reopened()
				: m.event_deal_reopened();
		case "merged":
			return payload.role === "duplicate"
				? m.event_merged_into({ name: payload.otherName ?? "" })
				: m.event_merged_from({ name: payload.otherName ?? "" });
		case "sent":
			if (e.type.startsWith("invoice.")) return m.event_invoice_emailed();
			return payload.email ? m.event_quote_emailed() : m.event_quote_sent();
		case "confirmed":
			return m.event_order_confirmed();
		case "fulfilled":
			return m.event_order_fulfilled();
		case "cancelled":
			return m.event_order_cancelled();
		case "invoiced":
			return m.event_order_invoiced();
		case "ordered":
			return m.event_quote_ordered();
		case "issued":
			return m.event_invoice_issued();
		case "voided":
			return m.event_invoice_voided();
		case "payment_recorded":
			return m.event_payment_recorded();
		case "payment_confirmed":
			return m.event_payment_confirmed();
		case "payment_rejected":
			return payload.reason
				? m.event_payment_rejected_reason({ reason: payload.reason })
				: m.event_payment_rejected();
		case "accepted":
			return m.event_quote_accepted();
		case "declined":
			return payload.reason
				? m.event_quote_declined_reason({ reason: payload.reason })
				: m.event_quote_declined();
		case "updated":
			if (!payload.changes && /^(quote|order|invoice)\./.test(e.type))
				return m.event_document_updated();
			return m.event_updated({
				fields: Object.keys(payload.changes ?? {})
					.map((key) => FIELD_LABELS[key]?.() ?? fieldLabels[key] ?? key)
					.join(", ")
					.toLowerCase(),
			});
		default:
			return e.type;
	}
}

const when = (value: Date | string) =>
	new Date(value).toLocaleString(getLocale());

// For an event of a related record (a contact's deal, quote, order or
// invoice): a link to it, before the description
function RelatedLink({ event: e }: { event: TimelineEvent }) {
	const className = "mr-1 font-medium hover:underline";
	switch (e.subjectType) {
		case "deal":
			return (
				<Link
					to="/deals/$dealId"
					params={{ dealId: e.subjectId }}
					className={className}
				>
					{e.relatedName ?? m.deal_name()}:
				</Link>
			);
		case "quote":
			return (
				<Link
					to="/quotes/$quoteId"
					params={{ quoteId: e.subjectId }}
					className={className}
				>
					{e.relatedNumber
						? quoteNumberLabel(e.relatedNumber)
						: m.quotes_title()}
					:
				</Link>
			);
		case "order":
			return (
				<Link
					to="/orders/$orderId"
					params={{ orderId: e.subjectId }}
					className={className}
				>
					{e.relatedNumber
						? orderNumberLabel(e.relatedNumber)
						: m.orders_title()}
					:
				</Link>
			);
		case "invoice":
			return (
				<Link
					to="/invoices/$invoiceId"
					params={{ invoiceId: e.subjectId }}
					className={className}
				>
					{invoiceLabel(e.relatedYear, e.relatedNumber) ||
						m.invoice_doc_draft()}
					:
				</Link>
			);
		default:
			return null;
	}
}

function actorName(e: TimelineEvent) {
	return e.actorType === "system"
		? m.common_system()
		: (e.actorName ?? m.common_someone());
}

// A record's notes and events, newest first with pinned notes on top (spec §11.2)
export function RecordTimeline({
	subjectType,
	subjectId,
	timeline,
	canWrite,
	canDeleteAny,
	currentUserId,
	fieldLabels = {},
	onChanged,
}: {
	subjectType: SubjectType;
	subjectId: string;
	timeline: Pick<Timeline, "notes" | "events">;
	canWrite: boolean;
	canDeleteAny: boolean;
	currentUserId: string;
	// Names of custom fields, keyed "custom.<key>"
	fieldLabels?: Record<string, string>;
	onChanged: () => Promise<void>;
}) {
	const [filter, setFilter] = useState<Filter>("all");
	const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
		null,
	);

	const run = async (action: () => Promise<unknown>, success?: string) => {
		setStatus(null);
		try {
			await action();
			if (success) setStatus({ ok: true, message: success });
			await onChanged();
			return true;
		} catch (e) {
			setStatus({ ok: false, message: await serverErrorMessage(e) });
			return false;
		}
	};

	const pinned = timeline.notes.filter((n) => n.pinned);
	type Item =
		| { kind: "note"; at: number; note: TimelineNote }
		| { kind: "event"; at: number; event: TimelineEvent };
	const items: Item[] = [
		...(filter !== "changes"
			? timeline.notes
					.filter((n) => !n.pinned)
					.map((n) => ({
						kind: "note" as const,
						at: new Date(n.createdAt).getTime(),
						note: n,
					}))
			: []),
		...(filter !== "notes"
			? timeline.events.map((e) => ({
					kind: "event" as const,
					at: new Date(e.createdAt).getTime(),
					event: e,
				}))
			: []),
	].sort((a, b) => b.at - a.at);
	const showPinned = filter !== "changes" ? pinned : [];

	const noteProps = {
		canWrite,
		canDeleteAny,
		currentUserId,
		onPin: (n: TimelineNote) =>
			run(() =>
				updateNote({ data: { id: n.id, body: n.body, pinned: !n.pinned } }),
			),
		onSave: (n: TimelineNote, body: string) =>
			run(() => updateNote({ data: { id: n.id, body, pinned: n.pinned } })),
		onDelete: (n: TimelineNote) => {
			if (!window.confirm(m.note_delete_confirm())) return;
			void run(() => deleteNote({ data: { id: n.id } }), m.note_deleted());
		},
	};

	return (
		<div className="space-y-4">
			{canWrite ? (
				<NoteComposer
					onAdd={(body) =>
						run(
							() => createNote({ data: { subjectType, subjectId, body } }),
							m.note_added(),
						)
					}
				/>
			) : null}
			<FormAlert
				message={status?.message ?? null}
				variant={status?.ok ? "success" : "destructive"}
			/>

			<fieldset className="inline-flex gap-1 rounded-lg bg-muted p-1">
				<legend className="sr-only">{m.timeline_filter()}</legend>
				{(
					[
						["all", m.timeline_all()],
						["notes", m.timeline_notes()],
						["changes", m.timeline_changes()],
					] as const
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						aria-pressed={filter === value}
						onClick={() => setFilter(value)}
						className={`rounded-md px-3 py-1 text-sm font-medium ${filter === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
					>
						{label}
					</button>
				))}
			</fieldset>

			{showPinned.length || items.length ? (
				<ol className="space-y-3">
					{showPinned.map((n) => (
						<NoteItem key={n.id} note={n} {...noteProps} />
					))}
					{items.map((item) =>
						item.kind === "note" ? (
							<NoteItem key={item.note.id} note={item.note} {...noteProps} />
						) : (
							<li key={item.event.id} className="flex gap-3 text-sm">
								<History
									className="mt-0.5 size-4 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
								<div>
									<p>
										{item.event.subjectId !== subjectId ? (
											<RelatedLink event={item.event} />
										) : null}
										{describe(item.event, fieldLabels)}
									</p>
									<p className="text-xs text-muted-foreground">
										{when(item.event.createdAt)} ·{" "}
										{m.common_by({ name: actorName(item.event) })}
									</p>
								</div>
							</li>
						),
					)}
				</ol>
			) : (
				<p className="text-sm text-muted-foreground">{m.timeline_empty()}</p>
			)}
		</div>
	);
}

function NoteComposer({
	onAdd,
}: {
	onAdd: (body: string) => Promise<boolean>;
}) {
	const [body, setBody] = useState("");
	const [busy, setBusy] = useState(false);
	return (
		<form
			className="space-y-2"
			onSubmit={async (e) => {
				e.preventDefault();
				if (!body.trim()) return;
				setBusy(true);
				if (await onAdd(body.trim())) setBody("");
				setBusy(false);
			}}
		>
			<Label htmlFor="new-note" className="sr-only">
				{m.note_label()}
			</Label>
			<Textarea
				id="new-note"
				value={body}
				onChange={(e) => setBody(e.target.value)}
				placeholder={m.note_placeholder()}
				maxLength={LIMITS.noteLength}
				rows={3}
			/>
			<div className="flex justify-end">
				<Button type="submit" size="sm" disabled={busy || !body.trim()}>
					<StickyNote /> {busy ? m.note_adding() : m.note_add()}
				</Button>
			</div>
		</form>
	);
}

function NoteItem({
	note,
	canWrite,
	canDeleteAny,
	currentUserId,
	onPin,
	onSave,
	onDelete,
}: {
	note: TimelineNote;
	canWrite: boolean;
	canDeleteAny: boolean;
	currentUserId: string;
	onPin: (n: TimelineNote) => Promise<boolean>;
	onSave: (n: TimelineNote, body: string) => Promise<boolean>;
	onDelete: (n: TimelineNote) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(note.body);
	const isAuthor = note.authorId === currentUserId;
	const edited =
		new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() >
		1000;

	return (
		<li className="rounded-lg border bg-background p-3">
			<div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<StickyNote className="size-3.5" aria-hidden="true" />
				<span className="font-medium text-foreground">
					{note.authorName ?? m.common_someone()}
				</span>
				<span>
					{when(note.createdAt)}
					{edited ? ` · ${m.note_edited()}` : ""}
				</span>
				{note.pinned ? (
					<Badge variant="secondary">{m.note_pinned()}</Badge>
				) : null}
				<div className="ml-auto flex gap-1">
					{canWrite ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label={note.pinned ? m.note_unpin() : m.note_pin()}
							onClick={() => void onPin(note)}
						>
							{note.pinned ? <PinOff /> : <Pin />}
						</Button>
					) : null}
					{canWrite && isAuthor && !editing ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label={m.note_edit()}
							onClick={() => {
								setDraft(note.body);
								setEditing(true);
							}}
						>
							<Pencil />
						</Button>
					) : null}
					{canWrite && (isAuthor || canDeleteAny) ? (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label={m.note_delete()}
							onClick={() => onDelete(note)}
						>
							<Trash2 />
						</Button>
					) : null}
				</div>
			</div>
			{editing ? (
				<form
					className="space-y-2"
					onSubmit={async (e) => {
						e.preventDefault();
						if (!draft.trim()) return;
						if (await onSave(note, draft.trim())) setEditing(false);
					}}
				>
					<Label htmlFor={`note-${note.id}`} className="sr-only">
						{m.note_text_label()}
					</Label>
					<Textarea
						id={`note-${note.id}`}
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						maxLength={LIMITS.noteLength}
						rows={3}
					/>
					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setEditing(false)}
						>
							{m.common_cancel()}
						</Button>
						<Button type="submit" size="sm" disabled={!draft.trim()}>
							{m.note_save()}
						</Button>
					</div>
				</form>
			) : (
				// Plain text: React escapes it, line breaks are kept
				<p className="text-sm whitespace-pre-wrap break-words">{note.body}</p>
			)}
		</li>
	);
}
