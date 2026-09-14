/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Errors_RequiredInputs */

const en_errors_required = /** @type {(inputs: Errors_RequiredInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Required`)
};

const nl_errors_required = /** @type {(inputs: Errors_RequiredInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Verplicht`)
};

/**
* | output |
* | --- |
* | "Required" |
*
* @param {Errors_RequiredInputs} inputs
* @param {{ locale?: "en" | "nl" }} options
* @returns {LocalizedString}
*/
export const errors_required = /** @type {((inputs?: Errors_RequiredInputs, options?: { locale?: "en" | "nl" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Errors_RequiredInputs, { locale?: "en" | "nl" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "nl") return nl_errors_required(inputs)
	return en_errors_required(inputs)
});
