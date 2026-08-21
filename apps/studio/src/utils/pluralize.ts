import { pluralize as pluralizeLib } from "@boringnode/pluralize";

export const pluralize = (word: string, count?: number): string => {
  if (count === undefined) return pluralizeLib(word);
  return `${count} ${count === 1 ? word : pluralizeLib(word)}`;
};
