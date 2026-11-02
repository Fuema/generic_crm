import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard } from "#/components/Auth/AuthCard";
import { ForgotPasswordForm } from "#/components/Auth/ForgotPasswordForm";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_guest/forgot-password")({
	component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
	return (
		<AuthCard
			title={m.auth_forgot_title()}
			description={m.auth_forgot_description()}
			footer={
				<Link to="/login" className="underline-offset-4 hover:underline">
					{m.common_back_to_sign_in()}
				</Link>
			}
		>
			<ForgotPasswordForm />
		</AuthCard>
	);
}
