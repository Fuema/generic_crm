import { useState } from "react";
import { serverErrorMessage } from "#/components/data/serverError";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Label } from "#/components/ui/label";
import {
	type ContactChoice,
	ContactPicker,
} from "#/modules/deals/components/DealFormDialog";
import { m } from "#/paraglide/messages.js";

// "New order" / "New invoice" from a list: pick the contact, create a draft
export function NewDocumentDialog({
	open,
	onOpenChange,
	title,
	onCreate,
	onError,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	onCreate: (contactId: string) => Promise<void>;
	onError: (message: string) => void;
}) {
	const [contact, setContact] = useState<ContactChoice | null>(null);
	const [busy, setBusy] = useState(false);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{m.quotes_new_description()}</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="new-document-contact">{m.deal_contact()}</Label>
					<ContactPicker
						id="new-document-contact"
						value={contact}
						invalid={false}
						onChange={setContact}
					/>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						{m.common_cancel()}
					</Button>
					<Button
						type="button"
						disabled={!contact || busy}
						onClick={async () => {
							if (!contact) return;
							setBusy(true);
							try {
								await onCreate(contact.id);
							} catch (e) {
								onError(await serverErrorMessage(e));
								onOpenChange(false);
							} finally {
								setBusy(false);
							}
						}}
					>
						{m.quotes_create_draft()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
