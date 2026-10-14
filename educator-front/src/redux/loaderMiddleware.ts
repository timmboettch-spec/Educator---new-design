import type { Middleware } from '@reduxjs/toolkit';
import { incrementApiRequest, decrementApiRequest } from './loader/loaderSlice';

// RTK Query endpoints that show their own loading state, so the full-page loader
// would make every request look like a page reload:
// - the Simulations Completed chart and its filters;
// - the class filter panel and assign modal dropdowns (a loader row inside the dropdown);
// - the class Reports table and its bulk review (own spinner / busy bar);
// - a class's student roster (own loading row, paged as it scrolls);
// - My Library (own skeleton and loading row, paged as it scrolls).
const SILENT_ENDPOINTS = new Set([
  'getSimulationsCompletedGraph',
  'getClassOptions',
  'getSchoolGroups',
  'getStudentOptions',
  'getClassRosterInfinite',
  'getSchoolOptionsInfinite',
  'getClassOptionsInfinite',
  'getAssignClassOptionsInfinite',
  'getReports',
  'getReportsInfinite',
  'bulkReviewReports',
  'markReportViewed',
  'getMyLibraryInfinite',
  'getMyLibraryUnitOptionsInfinite',
  'getMyLibraryTargetAudienceOptionsInfinite',
  'getMyLibraryProductNameOptionsInfinite',
]);

export const loaderMiddleware: Middleware =
  (store) => (next) => (action: unknown) => {
    if (typeof action === 'object' && action !== null && 'type' in action) {
      const typedAction = action as {
        type: string;
        meta?: {
          arg?: {
            silent?: boolean;
            endpointName?: string;
            subscribe?: boolean;
            forceRefetch?: boolean;
          };
        };
      };
      const actionType = typedAction.type || '';

      // allow call sites to skip global loader for specific thunk invocations
      if (typedAction.meta?.arg?.silent === true) {
        return next(action);
      }

      // RTK Query refetch after a tag invalidation: its data is already on screen, so a
      // background refresh following a mutation must not blank the page.
      if (
        typedAction.meta?.arg?.subscribe === false &&
        typedAction.meta.arg.forceRefetch === true
      ) {
        return next(action);
      }

      const endpointName = typedAction.meta?.arg?.endpointName;
      if (endpointName && SILENT_ENDPOINTS.has(endpointName)) {
        return next(action);
      }

      // skip logout actions — they handle their own navigation
      if (actionType.startsWith('auth/logout')) {
        return next(action);
      }

      const silentPrefixes = [
        'notifications/',
        'educatorReports/',
        'dashboard/overview',
        'dashboard/adminSimulationsReport',
        'dashboard/addSimulation',
        'classes/update',
        // Modal already shows Saving...; global AppLoader defers toasts and sits under the modal.
        'class/post',
        'auth/Me',
        'simulations/getByClass',
        'simulationReports/',
        'dashboard/fetchSimulationsByUnit',
        'dashboard/fetchMyLibrarySimulations',
        'dashboard/fetchSimulationLibraryWithDetails',
        'simulationCatalog/fetchById',
        'myLibrary/',
        '/classes/needAttention',
        'lmsSync/',
        'moodleClasses/',
      ];
      if (silentPrefixes.some((prefix) => actionType.startsWith(prefix))) {
        return next(action);
      }

      if (actionType.includes('/pending')) {
        store.dispatch(incrementApiRequest());
      } else if (
        actionType.includes('/fulfilled') ||
        actionType.includes('/rejected')
      ) {
        store.dispatch(decrementApiRequest());
      }
    }

    return next(action);
  };
