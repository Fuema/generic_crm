import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard } from "#/components/Auth/AuthCard";
import { TwoFactorForm } from "#/components/Auth/TwoFactorForm";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_guest/two-factor")({
	component: TwoFactorPage,
});

function TwoFactorPage() {
	return (
		<AuthCard
			title={m.auth_2fa_title()}
			description={m.auth_2fa_description()}
			footer={
				<Link to="/login" className="underline-offset-4 hover:underline">
					{m.common_back_to_sign_in()}
				</Link>
			}
		>
			<TwoFactorForm />
		</AuthCard>
	);
}
