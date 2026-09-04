import type { Middleware } from '@reduxjs/toolkit';
import { incrementApiRequest, decrementApiRequest } from './loader/loaderSlice';

export const loaderMiddleware: Middleware = (store) => (next) => (action: unknown) => {
  if (typeof action === 'object' && action !== null && 'type' in action) {
    const typedAction = action as { type: string; meta?: { arg?: { silent?: boolean } } };
    const actionType = typedAction.type || '';

    // allow call sites to skip global loader for specific thunk invocations
    if (typedAction.meta?.arg?.silent === true) {
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
      'currentUser/fetch',
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
    } else if (actionType.includes('/fulfilled') || actionType.includes('/rejected')) {
      store.dispatch(decrementApiRequest());
    }
  }

  return next(action);
};
