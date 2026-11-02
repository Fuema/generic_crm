import { Badge } from "#/components/ui/badge";
import type { CustomerStatus } from "#/lib/schema";

export const STATUS_LABELS: Record<CustomerStatus, string> = {
	lead: "Lead",
	active: "Active",
	inactive: "Inactive",
};

const VARIANTS: Record<CustomerStatus, "default" | "secondary" | "outline"> = {
	active: "default",
	lead: "secondary",
	inactive: "outline",
};

export function CustomerStatusBadge({ status }: { status: string }) {
	const known = status in STATUS_LABELS ? (status as CustomerStatus) : null;
	return (
		<Badge variant={known ? VARIANTS[known] : "outline"}>
			{known ? STATUS_LABELS[known] : status}
		</Badge>
	);
}
