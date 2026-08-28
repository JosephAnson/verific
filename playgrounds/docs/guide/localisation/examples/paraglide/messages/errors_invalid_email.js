/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */
/** @typedef {{}} Errors_Invalid_EmailInputs */

const en_errors_invalid_email = /** @type {(inputs: Errors_Invalid_EmailInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Enter a valid email address`)
};

const es_errors_invalid_email = /** @type {(inputs: Errors_Invalid_EmailInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Introduce una dirección de correo válida`)
};

/**
* @param {Errors_Invalid_EmailInputs} inputs
* @param {{ locale?: "en" | "es" }} options
* @returns {LocalizedString}
*/
export const errors_invalid_email = /** @type {((inputs?: Errors_Invalid_EmailInputs, options?: { locale?: "en" | "es" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Errors_Invalid_EmailInputs, { locale?: "en" | "es" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "es") return es_errors_invalid_email(inputs)
	return en_errors_invalid_email(inputs)
});
