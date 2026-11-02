// UUID v7 (RFC 9562): a 48-bit millisecond timestamp followed by random bits.
// Ids sort by creation time, which keeps indexes compact and lists stable.
export function uuidv7(now = Date.now()) {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	// 48-bit big-endian timestamp in the first 6 bytes
	let ms = now;
	for (let i = 5; i >= 0; i--) {
		bytes[i] = ms % 256;
		ms = Math.floor(ms / 256);
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
	bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
