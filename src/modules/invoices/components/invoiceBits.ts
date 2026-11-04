import { m } from "#/paraglide/messages.js";
import {
	INVOICE_STATUS_LABELS,
	type InvoiceDisplayStatus,
	invoiceLabel,
} from "../schema";

// How an invoice's status reads and looks
export function invoiceStatus(status: InvoiceDisplayStatus) {
	return {
		label: INVOICE_STATUS_LABELS[status]?.() ?? status,
		tone:
			status === "overdue" || status === "void"
				? ("bad" as const)
				: status === "paid"
					? ("good" as const)
					: status === "issued" || status === "partially_paid"
						? ("active" as const)
						: ("neutral" as const),
	};
}

// INV-2026-0001, or "Draft" before it is issued
export function invoiceTitle(year: number | null, number: number | null) {
	return invoiceLabel(year, number) || m.invoice_status_draft();
}

export function invoiceRow(i: {
	id: string;
	year: number | null;
	number: number | null;
	displayStatus: InvoiceDisplayStatus;
	totalCents: number;
	currency: string;
}) {
	return {
		id: i.id,
		label: invoiceTitle(i.year, i.number),
		totalCents: i.totalCents,
		currency: i.currency,
		status: invoiceStatus(i.displayStatus),
	};
}
