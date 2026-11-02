import { Badge } from "#/components/ui/badge";
import { type LifecycleStage, STAGE_LABELS } from "../schema";

const VARIANTS: Record<
	LifecycleStage,
	"default" | "secondary" | "outline" | "destructive"
> = {
	subscriber: "outline",
	lead: "secondary",
	qualified: "secondary",
	customer: "default",
	inactive: "outline",
};

export function StageBadge({ stage }: { stage: string }) {
	const known = stage in STAGE_LABELS ? (stage as LifecycleStage) : null;
	return (
		<Badge variant={known ? VARIANTS[known] : "outline"}>
			{known ? STAGE_LABELS[known]() : stage}
		</Badge>
	);
}
