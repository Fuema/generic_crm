import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { OrderEditor } from "#/components/Orders/OrderEditor";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { getBillingSettings } from "#/lib/billing";
import { createOrder, listOrderCustomers } from "#/lib/orders";
import { listActiveProducts } from "#/lib/products";

// listOrderCustomers requires order:create, so viewers are stopped by the server
export const Route = createFileRoute("/_authed/orders/new")({
	loader: async () => {
		const [customers, products, settings] = await Promise.all([
			listOrderCustomers(),
			listActiveProducts(),
			getBillingSettings(),
		]);
		return { customers, products, settings };
	},
	component: NewOrderPage,
});

function NewOrderPage() {
	const router = useRouter();
	const { customers, products, settings } = Route.useLoaderData();

	return (
		<div className="mx-auto max-w-4xl space-y-4 p-6">
			<Link
				to="/orders"
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
			>
				<ArrowLeft className="size-4" /> Orders
			</Link>
			<Card>
				<CardHeader>
					<CardTitle>New order</CardTitle>
					<CardDescription>
						Saved as a draft. You can change it until you confirm it. Amounts in{" "}
						{settings.currency}.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<OrderEditor
						customers={customers}
						products={products}
						currency={settings.currency}
						initial={{
							customerId: "",
							taxRate: settings.defaultTaxRate,
							notes: "",
							lines: [],
						}}
						submitLabel="Create draft order"
						onCancel={() => void router.navigate({ to: "/orders" })}
						onSave={async (value) => {
							const { id } = await createOrder({ data: value });
							await router.navigate({
								to: "/orders/$orderId",
								params: { orderId: id },
							});
						}}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
