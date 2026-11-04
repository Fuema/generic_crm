import { orderNumberLabel } from "#/lib/money";
import { ORDER_STATUS_LABELS, type OrderStatus } from "../schema";

// How an order's status reads and looks
export function orderStatus(status: string) {
	const s = status as OrderStatus;
	return {
		label: ORDER_STATUS_LABELS[s]?.() ?? status,
		tone:
			s === "fulfilled"
				? ("good" as const)
				: s === "cancelled"
					? ("bad" as const)
					: s === "confirmed"
						? ("active" as const)
						: ("neutral" as const),
	};
}

export function orderRow(o: {
	id: string;
	number: number;
	status: string;
	totalCents: number;
	currency: string;
}) {
	return {
		id: o.id,
		label: orderNumberLabel(o.number),
		totalCents: o.totalCents,
		currency: o.currency,
		status: orderStatus(o.status),
	};
}
