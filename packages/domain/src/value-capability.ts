import { normalizeStructuredValueTemplate as normalize } from "./structured-values";
import { setValueAtPath as setAtPath } from "./source-defaults";
import { typeAtPath as typeAt } from "./property-values";

export const normalizeStructuredValueTemplate = normalize;
export const setValueAtPath = setAtPath;
export const typeAtPath = typeAt;
