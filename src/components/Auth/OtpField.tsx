import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "#/components/ui/input-otp";

// 6-digit code input; calls onComplete as soon as the last digit is typed or pasted
export function OtpField({
	id,
	value,
	onChange,
	onComplete,
	disabled,
	invalid,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	onComplete?: (value: string) => void;
	disabled?: boolean;
	invalid?: boolean;
}) {
	return (
		<InputOTP
			id={id}
			maxLength={6}
			pattern={REGEXP_ONLY_DIGITS}
			value={value}
			onChange={onChange}
			onComplete={onComplete}
			disabled={disabled}
			autoComplete="one-time-code"
			inputMode="numeric"
			containerClassName="justify-center"
			aria-invalid={invalid}
		>
			<InputOTPGroup>
				<InputOTPSlot index={0} />
				<InputOTPSlot index={1} />
				<InputOTPSlot index={2} />
			</InputOTPGroup>
			<InputOTPSeparator />
			<InputOTPGroup>
				<InputOTPSlot index={3} />
				<InputOTPSlot index={4} />
				<InputOTPSlot index={5} />
			</InputOTPGroup>
		</InputOTP>
	);
}
