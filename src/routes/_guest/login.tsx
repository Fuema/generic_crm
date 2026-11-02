import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard } from "#/components/Auth/AuthCard";
import { SignInForm } from "#/components/Auth/SignInForm";
import { LanguageSwitcher } from "#/components/LanguageSwitcher";
import { getSocialProviders, safeRedirect } from "#/lib/auth-providers";
import { m } from "#/paraglide/messages.js";

const NOTICES: Record<string, () => string> = {
	"password-reset": m.login_notice_password_reset,
	"signed-out": m.login_notice_signed_out,
};

export const Route = createFileRoute("/_guest/login")({
	validateSearch: (
		search: Record<string, unknown>,
	): { redirect?: string; notice?: string; error?: string } => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
		notice: typeof search.notice === "string" ? search.notice : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	loader: () => getSocialProviders(),
	component: LoginPage,
});

function LoginPage() {
	const providers = Route.useLoaderData();
	const { redirect, notice, error } = Route.useSearch();

	return (
		<AuthCard
			title={m.login_title()}
			description={m.login_description()}
			footer={
				<div className="flex flex-col items-center gap-3">
					<p>
						{m.login_no_account()}{" "}
						<Link
							to="/signup"
							className="font-medium text-foreground underline-offset-4 hover:underline"
						>
							{m.login_sign_up()}
						</Link>
					</p>
					<LanguageSwitcher />
				</div>
			}
		>
			{error ? (
				<p role="alert" className="text-center text-sm text-destructive">
					{m.login_social_failed()}
				</p>
			) : null}
			<SignInForm
				providers={providers}
				redirectTo={safeRedirect(redirect)}
				notice={
					// Own keys only: a crafted ?notice=__proto__ must not reach the page
					notice && Object.hasOwn(NOTICES, notice)
						? NOTICES[notice]()
						: undefined
				}
			/>
		</AuthCard>
	);
}
