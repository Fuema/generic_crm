import { History } from "lucide-react";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import type { RecordEvent } from "../contacts";

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
};

function describe(e: RecordEvent) {
	const kind = e.type.split(".").pop();
	if (kind === "created") return m.event_created();
	if (kind === "archived") return m.event_archived();
	if (kind === "restored") return m.event_restored();
	if (kind === "updated") {
		const changes = (e.payload as { changes?: Record<string, unknown> })
			.changes;
		const fields = Object.keys(changes ?? {})
			.map((key) => FIELD_LABELS[key]?.() ?? key)
			.join(", ")
			.toLowerCase();
		return m.event_updated({ fields });
	}
	return e.type;
}

// The record's event log, newest first. The full timeline (notes, tasks,
// related records) replaces this in the next step of phase 1.
export function RecordHistory({ events }: { events: RecordEvent[] }) {
	if (!events.length) {
		return (
			<p className="text-sm text-muted-foreground">{m.common_no_history()}</p>
		);
	}
	return (
		<ol className="space-y-3">
			{events.map((e) => (
				<li key={e.id} className="flex gap-3 text-sm">
					<History
						className="mt-0.5 size-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					<div>
						<p>{describe(e)}</p>
						<p className="text-xs text-muted-foreground">
							{new Date(e.createdAt).toLocaleString(getLocale())} ·{" "}
							{m.common_by({
								name:
									e.actorType === "system"
										? m.common_system()
										: (e.actorName ?? m.common_someone()),
							})}
						</p>
					</div>
				</li>
			))}
		</ol>
	);
}
