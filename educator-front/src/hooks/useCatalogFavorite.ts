import { useState } from 'react';
import type { MouseEvent } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  fetchMyLibrary,
  selectLibraryLoaded,
  selectLibrarySimulationIds,
  selectNonRemovableIds,
  addPendingLibraryId,
  removePendingLibraryId,
  addPendingRemoveId,
  removePendingRemoveId,
} from '@/redux/simulation/MyLibraryRedux';
import { toast } from '@/components/common/Toast';
import loginEn from '@/locales/auth/login/en.json';
import loginEs from '@/locales/auth/login/es.json';
import type { SectionItem } from '@/types';
import { RemoveFromLibraryRequest } from '@/redux/simulation/RemoveFromLibraryRedux';
import { AddToLibraryRequest } from '@/redux/simulation/AddToLibraryRequestRedux';
import { selectIsStartTrial } from '@/redux/auth/LoginRedux';
import { updateSimulationFavorite } from '@/redux/simulation/FetchSimulationCatalogRedux';
import { AddToBulkLibraryRequest } from '@/redux/simulation/AddToBulkLibraryRequestRedux';
import { RemoveBulkLibraryRequest } from '@/redux/simulation/RemoveBulkLibraryRedux';

type SupportedLang = 'en' | 'es';
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

export const useCatalogFavorite = () => {
  const dispatch = useAppDispatch();
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const isStartTrial = useAppSelector(selectIsStartTrial);
  const nonRemovableIds = useAppSelector(selectNonRemovableIds);
  // What the educator has actually saved (plus in-flight adds, minus in-flight
  // removes). The catalogue's own `myFavorite` flag can't be trusted: the BE
  // resolves it with the user id while saved entries hold the educator profile
  // id, so it reads false for saved simulations and the heart would offer an
  // add that the BE refuses with "already exists".
  const libraryIds = useAppSelector(selectLibrarySimulationIds);
  const isLibraryLoaded = useAppSelector(selectLibraryLoaded);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const getSimKey = (item: SectionItem): string =>
    String(item.scenarioId ?? item.id);

  const isNonRemovable = (item: SectionItem): boolean => {
    const key = getSimKey(item);
    return nonRemovableIds.has(key);
  };

  const isInLibrary = (item: SectionItem) =>
    isLibraryLoaded
      ? libraryIds.has(getSimKey(item))
      : item.myFavorite === true;

  const isGroupInLibrary = (sims: SectionItem[]) => {
    return sims.length > 0 && sims.every((s) => isInLibrary(s));
  };

  /** True while an add/remove request for any of the group's sims is pending. */
  const isGroupSaving = (sims: SectionItem[]) =>
    sims.some((s) => loadingIds.has(getSimKey(s)));

  // Resyncs the saved-library ids the hearts read. The shared full library
  // isn't reloaded here: the add/remove request drops it as out of date, and
  // the assign modal loads it again on open, so one request per click is
  // enough.
  const refreshLibrary = () => {
    void dispatch(fetchMyLibrary());
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
      // Optimistic UI update so heart icon turns red/unfilled instantly on click
      dispatch(
        updateSimulationFavorite({ scenarioId: key, favorite: !wasInLibrary })
      );
      dispatch(
        wasInLibrary ? addPendingRemoveId(key) : addPendingLibraryId(key)
      );

      if (wasInLibrary) {
        await dispatch(RemoveFromLibraryRequest({ scenario_id: key })).unwrap();
        toast.success(locale.toast.removedFromLibrary);
      } else {
        await dispatch(
          AddToLibraryRequest({ scenario_id: key, unit_id: item.unit ?? '' })
        ).unwrap();
        toast.success(locale.toast.addedToLibrary);
      }
      refreshLibrary();
    } catch (err: unknown) {
      const errMsg =
        typeof err === 'string'
          ? err
          : ((err as { message?: string })?.message ?? '');
      const lower = errMsg.toLowerCase();

      // The BE already had it the way the educator wanted (e.g. changed in
      // another tab): keep the optimistic state and resync with the library.
      if (
        wasInLibrary &&
        (lower.includes('not found') || lower.includes('simulation not found'))
      ) {
        toast.success(locale.toast.removedFromLibrary);
        refreshLibrary();
        return;
      }

      if (
        !wasInLibrary &&
        (lower.includes('already exists') ||
          lower.includes('already in library'))
      ) {
        toast.success(locale.toast.addedToLibrary);
        refreshLibrary();
        return;
      }

      if (wasInLibrary) {
        dispatch(updateSimulationFavorite({ scenarioId: key, favorite: true }));
        dispatch(removePendingRemoveId(key));
      } else {
        dispatch(
          updateSimulationFavorite({ scenarioId: key, favorite: false })
        );
        dispatch(removePendingLibraryId(key));
      }

      toast.error(
        errMsg ||
          (wasInLibrary
            ? locale.toast.failedToRemoveFromLibrary
            : locale.toast.failedToAddToLibrary)
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
    // An empty group (e.g. a sim pack with no simulations) has nothing to do.
    if (isStartTrial || sims.length === 0) return;
    const allInLib = sims.every((s) => isInLibrary(s));

    const keys = sims.map(getSimKey);
    if (allInLib) {
      keys.forEach((k) => {
        dispatch(addPendingRemoveId(k));

        dispatch(
          updateSimulationFavorite({
            scenarioId: k,
            favorite: false,
          })
        );
      });
      setLoadingIds((prev) => {
        const s = new Set(prev);
        keys.forEach((k) => s.add(k));
        return s;
      });
      try {
        await dispatch(
          RemoveBulkLibraryRequest({
            scenarioIds: sims.map((s) => getSimKey(s)),
          })
        ).unwrap();
        toast.success(locale.toast.allSimulationsRemovedFromLibrary);
        refreshLibrary();
      } catch (err: unknown) {
        keys.forEach((k) => {
          dispatch(removePendingRemoveId(k));
          dispatch(updateSimulationFavorite({ scenarioId: k, favorite: true }));
        });
        const errMsg =
          typeof err === 'string'
            ? err
            : ((err as { message?: string })?.message ?? '');
        toast.error(errMsg || locale.toast.failedToRemoveFromLibrary);
      } finally {
        setLoadingIds((prev) => {
          const s = new Set(prev);
          keys.forEach((k) => s.delete(k));
          return s;
        });
      }
    } else {
      const toAdd = sims.filter((s) => !isInLibrary(s));
      if (toAdd.length === 0) return;
      const addKeys = toAdd.map(getSimKey);
      setLoadingIds((prev) => {
        const s = new Set(prev);
        addKeys.forEach((k) => s.add(k));
        return s;
      });
      try {
        await dispatch(
          AddToBulkLibraryRequest({
            scenarioIds: toAdd.map((s) => getSimKey(s)),
          })
        ).unwrap();
        addKeys.forEach((k) => {
          dispatch(addPendingLibraryId(k));

          dispatch(
            updateSimulationFavorite({
              scenarioId: k,
              favorite: true,
            })
          );
        });
        toast.success(locale.toast.allSimulationsAddedToLibrary);
        refreshLibrary();
      } catch (err: unknown) {
        // Nothing was marked as added before the request, so there is no
        // optimistic state to roll back.
        const errMsg =
          typeof err === 'string'
            ? err
            : ((err as { message?: string })?.message ?? '');
        toast.error(errMsg || locale.toast.failedToAddToLibrary);
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
    isGroupSaving,
    isNonRemovable,
    handleAddSim,
    handleAddGroup,
    isStartTrial,
  };
};
