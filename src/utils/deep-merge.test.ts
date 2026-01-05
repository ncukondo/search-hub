import { describe, it, expect } from 'vitest';
import { deepMerge, type DeepPartial } from './deep-merge';

describe('deepMerge', () => {
  it('merges shallow properties', () => {
    const base = { a: 1, b: 2 };
    const override = { b: 3, c: 4 };

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('merges nested objects recursively', () => {
    const base = { a: { b: 1, c: 2 }, d: 3 };
    const override: DeepPartial<typeof base> = { a: { c: 3, e: 4 } as never };

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: { b: 1, c: 3, e: 4 }, d: 3 });
  });

  it('replaces arrays instead of merging them', () => {
    const base = { arr: [1, 2, 3] };
    const override = { arr: [4, 5] };

    const result = deepMerge(base, override);

    expect(result).toEqual({ arr: [4, 5] });
  });

  it('undefined values do not override', () => {
    const base = { a: 1, b: 2 };
    const override = { a: undefined, b: 3 } as DeepPartial<typeof base>;

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: 1, b: 3 });
  });

  it('null values do override', () => {
    const base = { a: 1 as number | null, b: 2 };
    const override = { a: null, b: 3 };

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: null, b: 3 });
  });

  it('handles deeply nested structures', () => {
    const base = {
      level1: {
        level2: {
          level3: {
            a: 1,
            b: 2,
          },
        },
      },
    };
    const override: DeepPartial<typeof base> = {
      level1: {
        level2: {
          level3: {
            b: 3,
            c: 4,
          } as never,
        },
      },
    };

    const result = deepMerge(base, override);

    expect(result).toEqual({
      level1: {
        level2: {
          level3: {
            a: 1,
            b: 3,
            c: 4,
          },
        },
      },
    });
  });

  it('does not mutate original objects', () => {
    const base = { a: { b: 1 } };
    const override: DeepPartial<typeof base> = { a: { c: 2 } as never };

    deepMerge(base, override);

    expect(base).toEqual({ a: { b: 1 } });
    expect(override).toEqual({ a: { c: 2 } });
  });

  it('handles empty override', () => {
    const base = { a: 1, b: 2 };
    const override = {};

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('handles empty base', () => {
    const base = {} as { a?: number; b?: number };
    const override = { a: 1, b: 2 };

    const result = deepMerge(base, override);

    expect(result).toEqual({ a: 1, b: 2 });
  });
});
