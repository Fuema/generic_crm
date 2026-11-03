import { Badge } from "#/components/ui/badge";
import { QUOTE_STATUS_LABELS, type QuoteDisplayStatus } from "../schema";

// The status as a word (never color only)
export function QuoteStatusBadge({ status }: { status: QuoteDisplayStatus }) {
	const variant =
		status === "accepted"
			? "default"
			: status === "declined" || status === "expired"
				? "destructive"
				: status === "sent"
					? "outline"
					: "secondary";
	return (
		<Badge variant={variant}>{QUOTE_STATUS_LABELS[status]?.() ?? status}</Badge>
	);
}
