import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { formatDay } from "#/modules/deals/components/DealBits";
import { DocumentStatusBadge } from "#/modules/documents/components/DocumentBits";
import { m } from "#/paraglide/messages.js";
import type { ProjectRow } from "../projects";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "../schema";

// A project's status as a word (never color only)
export function projectStatus(status: string) {
	const s = status as ProjectStatus;
	return {
		label: PROJECT_STATUS_LABELS[s]?.() ?? status,
		tone:
			s === "completed"
				? ("good" as const)
				: s === "cancelled"
					? ("bad" as const)
					: s === "active"
						? ("active" as const)
						: ("neutral" as const),
	};
}

// The projects of a contact, company or deal on its record page
export function RelatedProjects({ projects }: { projects: ProjectRow[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{m.projects_title()}</CardTitle>
			</CardHeader>
			<CardContent>
				{projects.length ? (
					<ul className="divide-y">
						{projects.map((p) => (
							<li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
								<Link
									to="/projects/$projectId"
									params={{ projectId: p.id }}
									className="min-w-0 flex-1 font-medium hover:underline"
								>
									{p.name}
								</Link>
								{p.dueDate ? (
									<span className="text-xs text-muted-foreground">
										{m.project_due_on({ date: formatDay(p.dueDate) })}
									</span>
								) : null}
								<DocumentStatusBadge {...projectStatus(p.status)} />
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">
						{m.projects_none_here()}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
