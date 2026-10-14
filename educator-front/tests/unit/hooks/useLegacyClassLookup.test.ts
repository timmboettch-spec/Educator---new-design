import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLegacyClassLookup } from '../../../src/hooks/useLegacyClassLookup';
import type { ClassWithStudents } from '../../../src/types/Class_types';

const classes: ClassWithStudents[] = [
  { id: 'c-1', class_name: 'Biology', school_id: 's-1' },
  { id: 'c-2', class_name: 'Chemistry' },
];

describe('useLegacyClassLookup', () => {
  it('looks up legacy classes by id', () => {
    const { result } = renderHook(() => useLegacyClassLookup(classes));
    expect(result.current.get('c-1')).toBe(classes[0]);
    expect(result.current.get('c-2')?.class_name).toBe('Chemistry');
    expect(result.current.get('missing')).toBeUndefined();
  });

  it('keeps the same map until the class list changes', () => {
    const { result, rerender } = renderHook(
      ({ list }) => useLegacyClassLookup(list),
      { initialProps: { list: classes } }
    );
    const first = result.current;

    rerender({ list: classes });
    expect(result.current).toBe(first);

    rerender({ list: [...classes] });
    expect(result.current).not.toBe(first);
  });
});
