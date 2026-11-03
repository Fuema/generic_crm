// CSV reading and writing (RFC 4180), shared by browser and server. Spanish
// Excel saves with ";" — the separator is detected from the header line.

export const CSV_LIMITS = {
	importRows: 1000,
	// Rows per import request (Workers free plan: 50 subrequests per request)
	importBatch: 100,
	exportRows: 10_000,
	importBytes: 2_000_000,
} as const;

function detectSeparator(text: string) {
	const firstLine = text.slice(0, text.search(/\r?\n|$/));
	const commas = (firstLine.match(/,/g) ?? []).length;
	const semicolons = (firstLine.match(/;/g) ?? []).length;
	return semicolons > commas ? ";" : ",";
}

// Rows of cells; handles quoted cells with separators, quotes ("") and line
// breaks, a leading BOM, and CRLF or LF endings. Empty trailing lines are dropped.
export function parseCsv(input: string): string[][] {
	const text = input.replace(/^﻿/, "");
	const sep = detectSeparator(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cell += '"';
					i++;
				} else quoted = false;
			} else cell += ch;
		} else if (ch === '"' && cell === "") {
			quoted = true;
		} else if (ch === sep) {
			row.push(cell);
			cell = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && text[i + 1] === "\n") i++;
			row.push(cell);
			rows.push(row);
			row = [];
			cell = "";
		} else cell += ch;
	}
	if (cell !== "" || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// A cell that a spreadsheet would run as a formula gets a leading apostrophe
function safeCell(value: string) {
	return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toCsv(
	rows: (string | number | boolean | null | undefined)[][],
) {
	const lines = rows.map((r) =>
		r
			.map((v) => {
				const text = safeCell(v === null || v === undefined ? "" : String(v));
				return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
			})
			.join(","),
	);
	// BOM so Excel opens UTF-8 (accents) correctly
	return `﻿${lines.join("\r\n")}\r\n`;
}
