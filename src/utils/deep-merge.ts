/**
 * Recursive partial type for deep merging.
 * Allows undefined values explicitly (for overriding with undefined).
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? DeepPartial<T[P]> | undefined
    : T[P] | undefined;
};

/**
 * Check if a value is a plain object (not null, array, or other types).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep merge two objects.
 * - Nested objects are merged recursively
 * - Arrays are replaced (not merged)
 * - undefined values in override don't override base values
 * - null values do override
 * - Original objects are not mutated
 */
export function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  const result = { ...base } as Record<string, unknown>;

  for (const key of Object.keys(override) as (keyof T & string)[]) {
    const overrideValue = override[key];

    // Skip undefined values
    if (overrideValue === undefined) {
      continue;
    }

    const baseValue = result[key];

    // If both are plain objects, merge recursively
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      result[key] = deepMerge(baseValue, overrideValue);
    } else {
      // Otherwise, override (including arrays, primitives, null)
      result[key] = overrideValue;
    }
  }

  return result as T;
}
