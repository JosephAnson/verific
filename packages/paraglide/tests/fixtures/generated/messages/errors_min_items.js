/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ minimum: NonNullable<unknown>, count: NonNullable<unknown> }} Errors_Min_ItemsInputs */

const en_errors_min_items = /** @type {(inputs: Errors_Min_ItemsInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Need ${i?.minimum}, got ${i?.count}`)
};

const nl_errors_min_items = /** @type {(inputs: Errors_Min_ItemsInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Minimaal ${i?.minimum}, kreeg ${i?.count}`)
};

/**
* | output |
* | --- |
* | "Need {minimum}, got {count}" |
*
* @param {Errors_Min_ItemsInputs} inputs
* @param {{ locale?: "en" | "nl" }} options
* @returns {LocalizedString}
*/
export const errors_min_items = /** @type {((inputs: Errors_Min_ItemsInputs, options?: { locale?: "en" | "nl" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Errors_Min_ItemsInputs, { locale?: "en" | "nl" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "nl") return nl_errors_min_items(inputs)
	return en_errors_min_items(inputs)
});
