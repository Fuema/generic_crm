import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FormAlert } from "#/components/Auth/FormParts";
import { serverErrorMessage } from "#/components/data/serverError";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { m } from "#/paraglide/messages.js";
import { searchMergeCandidates } from "../contacts";
import { contactName } from "../schema";

type Candidate = Awaited<ReturnType<typeof searchMergeCandidates>>[number];

// Step 1 of a merge: pick the other contact, then open the side-by-side screen
export function MergeContactDialog({
	open,
	onOpenChange,
	contactId,
	name,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	contactId: string;
	name: string;
}) {
	const navigate = useNavigate();
	const [q, setQ] = useState("");
	const [rows, setRows] = useState<Candidate[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		const timer = setTimeout(async () => {
			setLoading(true);
			try {
				const found = await searchMergeCandidates({
					data: { excludeId: contactId, q },
				});
				if (!cancelled) {
					setRows(found);
					setError(null);
				}
			} catch (e) {
				if (!cancelled) setError(await serverErrorMessage(e));
			} finally {
				if (!cancelled) setLoading(false);
			}
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [open, q, contactId]);

	const pick = (id: string) => {
		onOpenChange(false);
		navigate({
			to: "/contacts/merge",
			search: { keep: contactId, duplicate: id },
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.merge_dialog_title({ name })}</DialogTitle>
					<DialogDescription>{m.merge_dialog_description()}</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="merge-search">{m.merge_search_label()}</Label>
					<Input
						id="merge-search"
						type="search"
						autoFocus
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder={m.merge_search_placeholder()}
					/>
				</div>
				<FormAlert message={error} variant="destructive" />
				<ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
					{rows.map((row) => (
						<li key={row.id}>
							<button
								type="button"
								className="w-full px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
								onClick={() => pick(row.id)}
							>
								<span className="block text-sm font-medium">
									{contactName(row)}
								</span>
								<span className="block text-xs text-muted-foreground">
									{[row.email, row.phone].filter(Boolean).join(" · ") ||
										m.common_none()}
								</span>
							</button>
						</li>
					))}
					{!rows.length && !loading ? (
						<li className="px-3 py-2 text-sm text-muted-foreground">
							{m.merge_no_results()}
						</li>
					) : null}
				</ul>
			</DialogContent>
		</Dialog>
	);
}
