import { Badge } from "#/components/ui/badge";
import { ROLE_LABELS, type WorkspaceRole } from "#/lib/permissions";

const VARIANTS: Record<WorkspaceRole, "default" | "secondary" | "outline"> = {
	owner: "default",
	admin: "default",
	editor: "secondary",
	viewer: "outline",
};

export function RoleBadge({ role }: { role: string }) {
	const known = role in ROLE_LABELS ? (role as WorkspaceRole) : null;
	return (
		<Badge
			variant={known ? VARIANTS[known] : "outline"}
			title={known ? ROLE_LABELS[known].description : undefined}
		>
			{known ? ROLE_LABELS[known].label : role}
		</Badge>
	);
}
