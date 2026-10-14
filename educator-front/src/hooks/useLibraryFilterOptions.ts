import { useEffect, useMemo, useState } from 'react';
import { skipToken } from '@reduxjs/toolkit/query/react';
import {
  useGetMyLibraryProductNameOptionsInfiniteQuery,
  useGetMyLibraryTargetAudienceOptionsInfiniteQuery,
  useGetMyLibraryUnitOptionsInfiniteQuery,
} from '../redux/api/myLibrary/myLibraryApi';
import {
  UNIT_DROPDOWN_PAGE_SIZE,
  buildFilterDropdownArg,
} from '../redux/api/myLibrary/myLibraryService';
import {
  rowsOf,
  toServerOptions,
  useLabelCache,
  type FilterOptionsField,
} from './useClassFilterOptions';
import { useDebouncedValue } from './useDebouncedValue';

/** One text dropdown: requested when first opened, searched on the server. */
function useTextDropdown(
  useQuery:
    | typeof useGetMyLibraryTargetAudienceOptionsInfiniteQuery
    | typeof useGetMyLibraryProductNameOptionsInfiniteQuery
): FilterOptionsField {
  const [isRequested, setIsRequested] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const result = useQuery(
    isRequested ? buildFilterDropdownArg(debouncedSearch) : skipToken
  );
  // The value is what the filter takes back, so it is its own label.
  const options = useMemo(
    () => rowsOf(result.currentData).map((value) => ({ value, label: value })),
    [result.currentData]
  );
  return {
    options,
    onOpen: () => setIsRequested(true),
    loading: !result.currentData && result.isFetching,
    server: toServerOptions(result, setSearch),
  };
}

/**
 * Options for My Library's Unit, Target Audience and Required Product Name
 * dropdowns, from the BE's dropdown routes (built from the educator's own
 * library), searched on the server with infinite scroll.
 *
 * Units load straight away: the Unit filter holds unit ids, so chips need
 * their names, and an older link that holds a unit's name needs its id. The
 * names of every unit loaded so far are kept. The other two load when their
 * dropdown is first opened.
 */
export function useLibraryFilterOptions() {
  const [unitSearch, setUnitSearch] = useState('');
  const debouncedUnitSearch = useDebouncedValue(unitSearch);
  const unitResult = useGetMyLibraryUnitOptionsInfiniteQuery(
    buildFilterDropdownArg(debouncedUnitSearch, UNIT_DROPDOWN_PAGE_SIZE)
  );
  const unitOptions = useMemo(
    () =>
      rowsOf(unitResult.currentData).map((unit) => ({
        value: unit.id,
        label: unit.name,
      })),
    [unitResult.currentData]
  );
  const unitNames = useLabelCache(unitOptions);

  // Settled once the first units answer (or fail); a later search doesn't
  // unsettle it.
  const hasUnitAnswer = !!unitResult.currentData || unitResult.isError;
  const [isUnitNamesSettled, setIsUnitNamesSettled] = useState(false);
  useEffect(() => {
    if (hasUnitAnswer) setIsUnitNamesSettled(true);
  }, [hasUnitAnswer]);

  const unitField: FilterOptionsField = {
    options: unitOptions,
    loading: !unitResult.currentData && unitResult.isFetching,
    selectedLabels: unitNames,
    server: toServerOptions(unitResult, setUnitSearch),
  };
  const targetAudienceField = useTextDropdown(
    useGetMyLibraryTargetAudienceOptionsInfiniteQuery
  );
  const productNameField = useTextDropdown(
    useGetMyLibraryProductNameOptionsInfiniteQuery
  );

  return {
    unitField,
    targetAudienceField,
    productNameField,
    /** Unit id → name, for every unit loaded so far. */
    unitNames,
    /** Whether the first units have answered (so `unitNames` can be relied on). */
    isUnitNamesSettled,
  };
}
