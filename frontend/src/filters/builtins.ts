import raw from "./builtins.json";
import { FilterDefinition, withDefaults } from "./definition";

export interface BuiltinFilter { slug: string; name: string; filter: FilterDefinition }

/** Fixed looks; sparse JSON is shared with scripts/filter_reference.py. */
export const BUILTIN_FILTERS: BuiltinFilter[] = (raw as { slug: string; name: string; filter: object }[])
  .map(b => ({ slug: b.slug, name: b.name, filter: withDefaults(b.filter) }));
