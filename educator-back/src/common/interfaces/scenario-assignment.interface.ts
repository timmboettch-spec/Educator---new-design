/**
 * Shape of `StudentsService.getSimulationsByCode()` — the same payload
 * `GET /api/students/simulations/:studentCode` returns. It may be the
 * top-level object or wrapped under `data`; both variants are handled.
 * Only the fields required for authorization are typed here.
 */
export interface EducatorSimulation {
  id?: string | number;
  simulation_id?: string | number;
  simulationId?: string | number;
}

export interface EducatorClassSimulation {
  simulation_id?: string | number;
  simulationId?: string | number;
}

export interface EducatorAssignmentPayload {
  simulations?: EducatorSimulation[];
  classSimulations?: EducatorClassSimulation[];
}

export interface EducatorAssignmentResponse {
  data?: EducatorAssignmentPayload;
  simulations?: EducatorSimulation[];
  classSimulations?: EducatorClassSimulation[];
}

