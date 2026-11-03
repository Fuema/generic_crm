import { Badge } from "#/components/ui/badge";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import { DEAL_STATUS_LABELS, type DealStatus } from "../schema";

// An all-day date (stored at 12:00 UTC) as the calendar day it stands for
export function formatDay(value: Date | string | null) {
	return value
		? new Date(value).toLocaleDateString(getLocale(), { timeZone: "UTC" })
		: m.common_none();
}

// Open / won / lost, with the word (never color only)
export function StatusBadge({ status }: { status: DealStatus }) {
	const variant =
		status === "won"
			? "default"
			: status === "lost"
				? "destructive"
				: "secondary";
	return (
		<Badge variant={variant}>{DEAL_STATUS_LABELS[status]?.() ?? status}</Badge>
	);
}
