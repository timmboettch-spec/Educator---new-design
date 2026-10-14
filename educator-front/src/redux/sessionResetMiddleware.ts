import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { LoginRequest, logout } from './auth/LoginRedux';
import { classesApi } from './api/classes/classesApi';
import { studentsApi } from './api/students/studentsApi';
import { guidedPathApi } from './api/guidedPath/guidedPathApi';
import { resetClassListQuery } from './api/classes/classesSlice';
import { reportsApi } from './api/reports/reportsApi';
import { classSimulationsApi } from './api/classSimulations/classSimulationsApi';
import { myLibraryApi } from './api/myLibrary/myLibraryApi';
import { resetMyLibrary } from './simulation/MyLibraryRedux';
import { clearSimulationLibraryState } from './dashboard/simulationlibrary/GetSimulationRedux';

/**
 * Clears per-user RTK Query caches, saved-library state and filter state when the session
 * changes, so the next user never sees the previous user's cached data (not every logout
 * reloads the page). Every logout path dispatches `logout()`.
 */
export const sessionResetMiddleware = createListenerMiddleware();

sessionResetMiddleware.startListening({
  matcher: isAnyOf(logout, LoginRequest.fulfilled),
  effect: (_action, api) => {
    api.dispatch(classesApi.util.resetApiState());
    api.dispatch(studentsApi.util.resetApiState());
    api.dispatch(guidedPathApi.util.resetApiState());
    api.dispatch(reportsApi.util.resetApiState());
    api.dispatch(classSimulationsApi.util.resetApiState());
    api.dispatch(myLibraryApi.util.resetApiState());
    // The catalogue hearts' saved ids and the assign modal's full library.
    api.dispatch(resetMyLibrary());
    api.dispatch(clearSimulationLibraryState());
    api.dispatch(resetClassListQuery());
  },
});
