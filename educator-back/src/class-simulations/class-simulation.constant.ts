export const ClassSimulationConstants = {
  ROUTES: {
    BASE: 'class-simulations',
    BY_CLASS: 'class/:class_id',
    BY_SIMULATION: 'simulation/:simulation_id',
    ID: ':id',
  },
  SWAGGER: {
    TAG: 'Class Simulations',
    ASSIGN: 'Assign a simulation to a class',
    BY_CLASS: 'Get all simulations for a class',
    BY_SIMULATION: 'Get all classes for a simulation',
    UPDATE: 'Update class simulation dates',
    REMOVE: 'Remove a simulation from a class',
  },
  MESSAGES: {
    ASSIGNED: 'Simulation assigned to class successfully',
    ALREADY_ASSIGNED: 'Simulation already assigned to this class',
    BY_CLASS_FETCHED: 'Class simulations fetched successfully',
    BY_SIMULATION_FETCHED: 'Simulation classes fetched successfully',
    UPDATED: 'Class simulation updated successfully',
    REMOVED: 'Class simulation removed successfully',
    NOT_FOUND: 'Class simulation record not found',
    CLASS_NOT_FOUND: 'Class not found',
    SIMULATION_NOT_FOUND: 'Simulation not found',
    EDUCATOR_NOT_FOUND: 'Educator not found',
    EDUCATOR_NOT_FOUND_CLASS: 'Educator not found for this class',
    NO_PERMISSION: 'You do not have permission to delete this simulation'
  },
  VALIDATION: {
    CLASS_ID_REQUIRED: 'Class ID is required',
    SIMULATION_ID_REQUIRED: 'Simulation ID is required',
  },
};
