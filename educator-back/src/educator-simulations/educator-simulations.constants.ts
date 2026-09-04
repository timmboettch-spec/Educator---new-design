export const EducatorSimulationsConstants = {
  ROUTES: {
    BASE: 'educator-simulations',
    ADD_TO_LIBRARY: 'add-to-library',
    ADD_TO_LIBRARY_BULK: 'add-to-library-bulk',
    REMOVE_FROM_LIBRARY: 'remove-from-library/:scenario_id',
    MY_LIBRARY: 'my-library',
  },
  SWAGGER: {
    TAG: 'Educator Simulations (My Library)',
  },
  MESSAGES: {
    ADDED: 'Simulation added to library successfully',
    REMOVED: 'Simulation removed from library successfully',
    ALREADY_IN_LIBRARY: 'Simulation already exists in library',
    NOT_FOUND: 'Simulation not found in library',
    MY_LIBRARY_FETCHED: 'My library fetched successfully',
  },
  VALIDATION: {
    USER_NOT_AUTHENTICATED: 'User not authenticated',
    SCENARIO_ID_REQUIRED: 'Scenario ID is required',
  },
};
