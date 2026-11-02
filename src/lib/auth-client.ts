import { passkeyClient } from "@better-auth/passkey/client";
import {
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { m } from "#/paraglide/messages.js";
import { ac, roles } from "./permissions";

// No baseURL: the client calls /api/auth on the current origin, which works on
// localhost and on Cloudflare, and avoids touching `window` during SSR.
export const authClient = createAuthClient({
	plugins: [
		twoFactorClient({
			// Password sign-in for a user with 2FA returns no session yet: send them to the second step
			onTwoFactorRedirect() {
				window.location.href = "/two-factor";
			},
		}),
		passkeyClient(),
		organizationClient({ ac, roles }),
	],
});

// Turns Better Auth error codes into messages a user can act on
export function authErrorMessage(
	error:
		| { code?: string; message?: string; status?: number }
		| null
		| undefined,
) {
	if (!error) return m.error_generic();
	if (error.status === 429) return m.error_too_many_requests();
	switch (error.code) {
		case "INVALID_EMAIL_OR_PASSWORD":
			return m.error_invalid_email_or_password();
		case "EMAIL_NOT_VERIFIED":
			return m.error_email_not_verified();
		case "USER_ALREADY_EXISTS":
		case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
			return m.error_user_exists();
		case "INVALID_CODE":
			return m.error_invalid_code();
		case "OTP_HAS_EXPIRED":
			return m.error_code_expired();
		case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
			return m.error_too_many_codes();
		case "ACCOUNT_TEMPORARILY_LOCKED":
			return m.error_account_locked();
		case "INVALID_TWO_FACTOR_COOKIE":
			return m.error_two_factor_expired();
		case "INVALID_BACKUP_CODE":
			return m.error_invalid_backup_code();
		case "INVALID_PASSWORD":
			return m.error_invalid_password();
		case "INVALID_TOKEN":
			return m.error_invalid_token();
		case "SESSION_EXPIRED":
			return m.error_session_expired();
		case "ORGANIZATION_SLUG_ALREADY_TAKEN":
			return m.error_slug_taken();
		case "INVITATION_NOT_FOUND":
			return m.error_invitation_not_found();
		case "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION":
			return m.error_invitation_wrong_recipient();
		case "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION":
			return m.error_invitation_verify_first();
		case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
			return m.error_already_member();
		case "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION":
			return m.error_already_invited();
		case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER":
			return m.error_only_owner();
		case "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED":
			return m.error_member_limit();
		case "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS":
			return m.error_workspace_limit();
		default:
			if (error.code?.startsWith("YOU_ARE_NOT_ALLOWED")) {
				return m.error_not_allowed();
			}
			// Server messages (e.g. our own validation) are already in the request's language
			return error.message || m.error_generic();
	}
}
