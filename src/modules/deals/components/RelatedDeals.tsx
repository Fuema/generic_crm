import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { formatMoney } from "#/lib/money";
import { getRecordFields, type RecordFields } from "#/modules/fields/fields";
import { localized } from "#/modules/fields/schema";
import { listPipelines, type Pipelines } from "#/modules/pipelines/pipelines";
import { m } from "#/paraglide/messages.js";
import { createDeal, type DealRow } from "../deals";
import type { DealStatus } from "../schema";
import { StatusBadge } from "./DealBits";
import {
	type ContactChoice,
	DealFormDialog,
	emptyDeal,
} from "./DealFormDialog";

// The deals of a contact or company on its record page, with "New deal"
// prefilled. Pipelines and deal fields load only when the form opens.
export function RelatedDeals({
	deals,
	currency,
	contact,
	companyId,
	canCreate,
	options,
}: {
	deals: DealRow[];
	currency: string;
	contact: ContactChoice | null;
	companyId?: string;
	canCreate: boolean;
	options: {
		members: { id: string; name: string }[];
		companies: { id: string; name: string }[];
	};
}) {
	const navigate = useNavigate();
	const [form, setForm] = useState<{
		pipelines: Pipelines;
		fields: RecordFields;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const openForm = async () => {
		setError(null);
		setLoading(true);
		try {
			const [pipelines, fields] = await Promise.all([
				listPipelines({ data: { includeArchived: false } }),
				getRecordFields({ data: { objectKey: "deal" } }),
			]);
			if (!pipelines.length) setError(m.deals_no_pipeline());
			else setForm({ pipelines, fields });
		} catch (e) {
			setError(await serverErrorMessage(e));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
				<CardTitle>{m.deals_title()}</CardTitle>
				{canCreate ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={loading}
						onClick={openForm}
					>
						<Plus /> {m.deals_new()}
					</Button>
				) : null}
			</CardHeader>
			<CardContent className="space-y-2">
				<FormAlert message={error} />
				{deals.length ? (
					<ul className="divide-y">
						{deals.map((d) => (
							<li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
								<Link
									to="/deals/$dealId"
									params={{ dealId: d.id }}
									className="min-w-0 flex-1 font-medium hover:underline"
								>
									{d.name}
								</Link>
								<span className="text-xs text-muted-foreground">
									{d.stageName ? localized(d.stageName) : ""}
								</span>
								<span className="text-sm tabular-nums">
									{formatMoney(d.valueCents, currency)}
								</span>
								<StatusBadge status={d.status as DealStatus} />
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">{m.deals_none_here()}</p>
				)}
			</CardContent>
			{form ? (
				<DealFormDialog
					open
					onOpenChange={(open) => {
						if (!open) setForm(null);
					}}
					initial={emptyDeal(form.pipelines, contact, companyId)}
					initialContact={contact}
					initialCustom={{}}
					editing={false}
					fields={form.fields}
					options={{ pipelines: form.pipelines, ...options }}
					onSave={async (value) => {
						const { id } = await createDeal({ data: value });
						setForm(null);
						void navigate({ to: "/deals/$dealId", params: { dealId: id } });
					}}
				/>
			) : null}
		</Card>
	);
}
