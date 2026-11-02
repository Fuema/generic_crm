import { getLocale } from "#/paraglide/runtime.js";

// ISO 3166-1 alpha-2 country codes. Stored on customers as the code; the name
// is produced by Intl.DisplayNames, so no translation table is needed.
export const COUNTRY_CODES = (
	"AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
	"CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
	"GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
	"KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
	"MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
	"SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
	"UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ") as [string, ...string[]];

// One Intl.DisplayNames per language, created on first use
const displayNames = new Map<string, Intl.DisplayNames>();

// The country's name in the page language (English unless given)
export function countryName(
	code: string | null | undefined,
	locale: string = getLocale(),
) {
	if (!code) return "";
	try {
		let names = displayNames.get(locale);
		if (!names) {
			names = new Intl.DisplayNames([locale], { type: "region" });
			displayNames.set(locale, names);
		}
		return names.of(code) ?? code;
	} catch {
		return code;
	}
}

// Sorted by name in the given language, for selects
export function countryOptions(locale: string = getLocale()) {
	return COUNTRY_CODES.map((code) => ({
		code,
		name: countryName(code, locale),
	})).sort((x, y) => x.name.localeCompare(y.name, locale));
}

// Sorted by display name, for selects
export const COUNTRY_OPTIONS = COUNTRY_CODES.map((code) => ({
	code,
	name: countryName(code, "en"),
})).sort((a, b) => a.name.localeCompare(b.name));
