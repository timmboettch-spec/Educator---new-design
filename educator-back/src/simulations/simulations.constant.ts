export const SimulationConstants = {
  ROUTES: {
    BASE: 'simulations',
    ALIAS: 'scenarios',
    ID: ':id',
    BY_UNIT: 'unit/:unit_id',
    IMPORT: 'import',
    ALL_DETAILS: 'all-details',
  },
  SWAGGER: {
    TAG: 'Simulations (Scenarios)',
    ALL: 'Get all simulations',
    ALL_DETAILS: 'Get all simulations with full blob data and merged unit info',
    BY_ID: 'Get a simulation by ID',
    IMPORT: 'Import simulations from scenarios.json payload',
    DELETE: 'Delete a simulation',
  },
  MESSAGES: {
    ALL_FETCHED: 'All simulations fetched successfully',
    FETCHED: 'Simulation fetched successfully',
    NOT_FOUND: 'Simulation not found',
    DELETED: 'Simulation deleted successfully',
    IMPORTED: 'Scenarios imported successfully',
    DUPLICATE: 'Simulation with this name already exists for the class',
  },
  VALIDATION: {
    SIMULATION_ID_REQUIRED: 'Simulation ID is required',
    IMPORT_DATA_REQUIRED: 'Import data is required',
    EDUCATOR_ONLY_CREATE: 'Only educators are allowed to import simulations',
    EDUCATOR_ONLY_DELETE: 'Only educators are allowed to delete simulations',
  },
};
