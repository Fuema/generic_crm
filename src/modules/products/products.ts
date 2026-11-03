import { createServerFn } from "@tanstack/react-start";
import { requirePermission } from "#/lib/authz";
import * as data from "./products.server";
import {
	productIdSchema,
	productInputSchema,
	productPickerSchema,
	productSearchSchema,
	updateProductSchema,
} from "./schema";

// Server functions for the product catalog. Each checks the caller's role and
// validates its input, then calls the data layer with the workspace from the
// session (context.workspaceId), never from input.

const member = (userId: string) => ({ type: "member" as const, id: userId });

export const listProducts = createServerFn({ method: "GET" })
	.middleware([requirePermission({ product: ["read"] })])
	.validator(productSearchSchema)
	.handler(({ data: search, context }) =>
		data.listProducts(context.workspaceId, search),
	);

// Active products for document line pickers (orders today, quotes next)
export const pickProducts = createServerFn({ method: "GET" })
	.middleware([requirePermission({ product: ["read"] })])
	.validator(productPickerSchema)
	.handler(({ data: { q }, context }) =>
		data.pickProducts(context.workspaceId, q),
	);

export const createProduct = createServerFn({ method: "POST" })
	.middleware([requirePermission({ product: ["create"] })])
	.validator(productInputSchema)
	.handler(({ data: input, context }) =>
		data.createProduct(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateProduct = createServerFn({ method: "POST" })
	.middleware([requirePermission({ product: ["update"] })])
	.validator(updateProductSchema)
	.handler(({ data: { id, ...input }, context }) =>
		data.updateProduct(
			context.workspaceId,
			member(context.session.user.id),
			id,
			input,
		),
	);

export const archiveProduct = createServerFn({ method: "POST" })
	.middleware([requirePermission({ product: ["delete"] })])
	.validator(productIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setProductArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			true,
		),
	);

export const restoreProduct = createServerFn({ method: "POST" })
	.middleware([requirePermission({ product: ["delete"] })])
	.validator(productIdSchema)
	.handler(({ data: { id }, context }) =>
		data.setProductArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			false,
		),
	);

export type ProductRow = Awaited<
	ReturnType<typeof listProducts>
>["rows"][number];
export type ProductOption = Awaited<ReturnType<typeof pickProducts>>[number];
