import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard } from "#/components/Auth/AuthCard";
import { SignUpForm } from "#/components/Auth/SignUpForm";
import { getSocialProviders } from "#/lib/auth-providers";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_guest/signup")({
	loader: () => getSocialProviders(),
	component: SignUpPage,
});

function SignUpPage() {
	const providers = Route.useLoaderData();

	return (
		<AuthCard
			title={m.auth_signup_title()}
			description={m.auth_signup_description()}
			footer={
				<p>
					{m.auth_signup_have_account()}{" "}
					<Link
						to="/login"
						className="font-medium text-foreground underline-offset-4 hover:underline"
					>
						{m.auth_signup_sign_in()}
					</Link>
				</p>
			}
		>
			<SignUpForm providers={providers} />
		</AuthCard>
	);
}
