import type { ReactNode } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

// A chart with a title, and a table view so no value depends on color or hover
export function ChartCard({
	title,
	description,
	children,
	table,
}: {
	title: string;
	description?: string;
	children: ReactNode;
	table: { headers: [string, string]; rows: [string, string][] };
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
			<CardContent className="space-y-4">
				{children}
				<details className="text-sm">
					<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
						Show as table
					</summary>
					<table className="mt-2 w-full tabular-nums">
						<thead>
							<tr className="border-b text-left text-muted-foreground">
								<th className="py-1 font-medium">{table.headers[0]}</th>
								<th className="py-1 text-right font-medium">
									{table.headers[1]}
								</th>
							</tr>
						</thead>
						<tbody>
							{table.rows.map(([a, b]) => (
								<tr key={a} className="border-b last:border-0">
									<td className="py-1">{a}</td>
									<td className="py-1 text-right">{b}</td>
								</tr>
							))}
						</tbody>
					</table>
				</details>
			</CardContent>
		</Card>
	);
}
