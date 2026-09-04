import { useState } from 'react';
import type { MouseEvent } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  selectNonRemovableIds,
  addPendingLibraryId,
  removePendingLibraryId,
  addPendingRemoveId,
  removePendingRemoveId,
} from '@/redux/simulation/MyLibraryRedux';
import { toast } from '@/components/common/Toast';
import type { SectionItem } from '@/types';
import { RemoveFromLibraryRequest } from '@/redux/simulation/RemoveFromLibraryRedux';
import { AddToLibraryRequest } from '@/redux/simulation/AddToLibraryRequestRedux';
import { selectIsStartTrial } from '@/redux/auth/LoginRedux';
import { updateSimulationFavorite } from '@/redux/simulation/FetchSimulationCatalogRedux';
import { AddToBulkLibraryRequest } from '@/redux/simulation/AddToBulkLibraryRequestRedux';

export const useCatalogFavorite = () => {
  const dispatch = useAppDispatch();
  const isStartTrial = useAppSelector(selectIsStartTrial);
  const nonRemovableIds = useAppSelector(selectNonRemovableIds);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const getSimKey = (item: SectionItem): string => String(item.scenarioId ?? item.id);

  const isNonRemovable = (item: SectionItem): boolean => {
    const key = getSimKey(item);
    return nonRemovableIds.has(key);
  };

  const isInLibrary = (item: SectionItem) => {
    return item.myFavorite === true;
  };

  const isGroupInLibrary = (sims: SectionItem[]) => {
    return sims.length > 0 && sims.every((s) => isInLibrary(s));
  };

  const handleAddSim = async (e: MouseEvent, item: SectionItem) => {
    e.stopPropagation();
    if (isStartTrial) return;
    const key = getSimKey(item);
    if (loadingIds.has(key)) return;

    const wasInLibrary = isInLibrary(item);
    if (wasInLibrary && isNonRemovable(item)) return;

    setLoadingIds((prev) => new Set(prev).add(key));
    try {
      if (wasInLibrary) {
        await dispatch(RemoveFromLibraryRequest({ scenario_id: key })).unwrap();
        dispatch(updateSimulationFavorite({ scenarioId: key, favorite: false }));
        dispatch(addPendingRemoveId(key));
        toast.success('Removed from library successfully');
      } else {
        await dispatch(
          AddToLibraryRequest({ scenario_id: key, unit_id: item.unit ?? '' }),
        ).unwrap();
        dispatch(updateSimulationFavorite({ scenarioId: key, favorite: true, }),);
        dispatch(addPendingLibraryId(key));
        toast.success('Added to library successfully');
      }
    } catch (err: unknown) {
      const errMsg = typeof err === 'string'
        ? err
        : (err as { message?: string })?.message ?? '';
      const lower = errMsg.toLowerCase();


      if (wasInLibrary && (lower.includes('not found') || lower.includes('simulation not found'))) {
        toast.success('Removed from library successfully');
        return;
      }

      if (!wasInLibrary && (lower.includes('already exists') || lower.includes('already in library'))) {
        toast.success('Added to library successfully');
        return;
      }

      if (wasInLibrary) {
        dispatch(updateSimulationFavorite({ scenarioId: key, favorite: true }));
        dispatch(removePendingRemoveId(key));
      } else {
        dispatch(updateSimulationFavorite({ scenarioId: key, favorite: false }));
        dispatch(removePendingLibraryId(key));
      }

      toast.error(
        errMsg || (wasInLibrary ? 'Failed to remove from library' : 'Failed to add to library'),
      );
    } finally {
      setLoadingIds((prev) => {
        const s = new Set(prev);
        s.delete(key);
        return s;
      });
    }
  };

  const handleAddGroup = async (e: MouseEvent, sims: SectionItem[]) => {
    e.stopPropagation();
    if (isStartTrial) return;
    const allInLib = sims.every((s) => s.myFavorite);

    const keys = sims.map(getSimKey);
    if (allInLib) {
      keys.forEach((k) => {
        dispatch(addPendingRemoveId(k));

        dispatch(
          updateSimulationFavorite({
            scenarioId: k,
            favorite: false,
          }),
        );
      });
      setLoadingIds((prev) => {
        const s = new Set(prev);
        keys.forEach((k) => s.add(k));
        return s;
      });
      try {
        await Promise.all(
          sims.map((s) =>
            dispatch(RemoveFromLibraryRequest({ scenario_id: getSimKey(s) }))
              .unwrap()
              .catch((err: unknown) => {
                const msg = typeof err === 'string' ? err : (err as { message?: string })?.message ?? '';
                if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('simulation not found')) return;
                throw err;
              }),
          ),
        );
        toast.success('All simulations removed from library');
      } catch (err: unknown) {
        keys.forEach((k) => dispatch(removePendingRemoveId(k)));
        const errMsg = typeof err === 'string' ? err : (err as { message?: string })?.message ?? '';
        toast.error(errMsg || 'Failed to remove from library');
      } finally {
        setLoadingIds((prev) => {
          const s = new Set(prev);
          keys.forEach((k) => s.delete(k));
          return s;
        });
      }
    } else {
      const toAdd = sims.filter((s) => !s.myFavorite);
      if (toAdd.length === 0) return;
      const addKeys = toAdd.map(getSimKey);
      setLoadingIds((prev) => {
        const s = new Set(prev);
        addKeys.forEach((k) => s.add(k));
        return s;
      });
      try {
        await dispatch(AddToBulkLibraryRequest({ scenarioIds: toAdd.map((s) => getSimKey(s)), }),).unwrap();
        addKeys.forEach((k) => {
          dispatch(addPendingLibraryId(k));

          dispatch(
            updateSimulationFavorite({
              scenarioId: k,
              favorite: true,
            }),
          );
        });
        toast.success('All simulations added to library');
      } catch (err: unknown) {
        keys.forEach((k) => {
          dispatch(removePendingRemoveId(k));
          dispatch(
            updateSimulationFavorite({
              scenarioId: k,
              favorite: true,
            }),
          );
        });
        const errMsg = typeof err === 'string' ? err : (err as { message?: string })?.message ?? '';
        toast.error(errMsg || 'Failed to add to library');
      } finally {
        setLoadingIds((prev) => {
          const s = new Set(prev);
          addKeys.forEach((k) => s.delete(k));
          return s;
        });
      }
    }
  };

  return {
    loadingIds,
    isInLibrary,
    isGroupInLibrary,
    isNonRemovable,
    handleAddSim,
    handleAddGroup,
    isStartTrial,
  };
};
