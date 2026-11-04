import { createServerFn } from "@tanstack/react-start";
import { requirePermission } from "#/lib/authz";
import { hasPermission } from "#/platform/permissions.server";
import * as data from "./payments.server";
import {
	decidePaymentSchema,
	invoicePaymentsSchema,
	recordPaymentSchema,
} from "./schema";

// Server functions for payments. Recording needs invoice:update (editors
// too); a payment recorded by someone who may also confirm (invoice:pay:
// owners and admins) counts at once, otherwise it waits as reported.
// Confirming and rejecting need invoice:pay.

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listPayments = createServerFn({ method: "GET" })
	.middleware([requirePermission({ invoice: ["read"] })])
	.validator(invoicePaymentsSchema)
	.handler(({ data: { invoiceId }, context }) =>
		data.listPayments(context.workspaceId, invoiceId),
	);

export const recordPayment = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["update"] })])
	.validator(recordPaymentSchema)
	.handler(async ({ data: input, context }) => {
		const canConfirm = await hasPermission(context.workspaceId, {
			invoice: ["pay"],
		});
		return data.recordPayment(
			context.workspaceId,
			member(context.session.user.id),
			input,
			canConfirm,
		);
	});

export const decidePayment = createServerFn({ method: "POST" })
	.middleware([requirePermission({ invoice: ["pay"] })])
	.validator(decidePaymentSchema)
	.handler(({ data: input, context }) =>
		data.decidePayment(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export type PaymentRow = Awaited<ReturnType<typeof listPayments>>[number];
