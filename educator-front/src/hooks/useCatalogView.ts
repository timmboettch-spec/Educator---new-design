import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isCatalogView, type CatalogView } from '../utils/catalogViews';

const VIEW_PARAM = 'view';

/**
 * The catalogue view (All / Favorites / Sim Packs / Units), kept in the URL
 * so Back from a simulation's details returns to the same view. A missing or
 * unknown value means All.
 */
export function useCatalogView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get(VIEW_PARAM);
  const view: CatalogView = isCatalogView(param) ? param : 'all';

  const setView = useCallback(
    (next: CatalogView) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === 'all') params.delete(VIEW_PARAM);
          else params.set(VIEW_PARAM, next);
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return { view, setView };
}
