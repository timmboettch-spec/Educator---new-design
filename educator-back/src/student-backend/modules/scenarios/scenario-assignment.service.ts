import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { StudentsService } from 'src/students/students.service';

/**
 * Shape of the Educator backend response for
 * `GET /students/simulations/{studentId}`.
 *
 * The upstream may return the assignment payload either as the top-level
 * object or wrapped under a `data` property; both variants are handled.
 * Only the fields required for authorization are typed here.
 */
interface EducatorSimulation {
  id?: string | number;
  simulation_id?: string | number;
  simulationId?: string | number;
}

interface EducatorClassSimulation {
  simulation_id?: string | number;
  simulationId?: string | number;
}

interface EducatorAssignmentPayload {
  simulations?: EducatorSimulation[];
  classSimulations?: EducatorClassSimulation[];
}

interface EducatorAssignmentResponse {
  data?: EducatorAssignmentPayload;
  simulations?: EducatorSimulation[];
  classSimulations?: EducatorClassSimulation[];
}

/**
 * Calls the Educator backend to determine which scenarios / simulations a
 * given student has been assigned. The Educator API is treated as the
 * single source of truth for assignment; local data files must not be
 * consulted for scenario launch authorization.
 */
@Injectable()
export class ScenarioAssignmentService {
  private static readonly logger = new Logger(ScenarioAssignmentService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly studentService: StudentsService,
  ) {}

  async getAssignedSimulationIds(studentId: string, _bearerToken: string): Promise<Set<string>> {
    const payload = await this.studentService.getSimulationsByCode(studentId);
    if (!payload) {
      throw new ServiceUnavailableException('Unable to verify scenario assignment at this time');
    }

    return ScenarioAssignmentService.extractAssignedIds(payload);
  }

  /**
   * Fetches the assigned simulation ids for `studentId` from the Educator
   * backend and returns them as a normalized `Set<string>`.
   *
   * @param studentId  The student identifier extracted from the validated
   *                   JWT (typically `payload.sub`).
   * @param bearerToken  The raw Educator-issued bearer token from the
   *                     incoming request. Forwarded so the Educator API can
   *                     re-authenticate the call.
   */
  // async getAssignedSimulationIds(studentId: string, bearerToken: string): Promise<Set<string>> {
  //   const baseUrl = this.getEducatorBaseUrl();
  //   const url = `${baseUrl}/students/simulations/${encodeURIComponent(studentId)}`;

  //   let payload: EducatorAssignmentResponse;
  //   try {
  //     const response = await firstValueFrom(
  //       this.httpService.get<EducatorAssignmentResponse>(url, {
  //         headers: {
  //           Authorization: `Bearer ${bearerToken}`,
  //           'ngrok-skip-browser-warning': 'true',
  //         },
  //       }),
  //     );
  //     payload = response.data;
  //   } catch (err) {
  //     const axiosErr = err as AxiosError;
  //     const status = axiosErr.response?.status;
  //     // Upstream explicitly rejected the caller — surface as 403 so the
  //     // student is denied without leaking upstream detail.
  //     if (status === 401 || status === 403) {
  //       ScenarioAssignmentService.logger.warn(
  //         `Educator API rejected assignment lookup for student=${studentId} with status=${status}`,
  //       );
  //       throw new ForbiddenException('Scenario not assigned to this student');
  //     }
  //     ScenarioAssignmentService.logger.error(
  //       `Educator API request failed for student=${studentId}: ${axiosErr.message}`,
  //     );
  //     throw new ServiceUnavailableException('Unable to verify scenario assignment at this time');
  //   }

  //   return ScenarioAssignmentService.extractAssignedIds(payload);
  // }

  /**
   * Convenience helper — returns `true` when `scenarioId` is present in the
   * Educator-reported assignment set for `studentId`.
   */
  async isScenarioAssigned(
    studentId: string,
    scenarioId: string,
    bearerToken: string,
  ): Promise<boolean> {
    const assigned = await this.getAssignedSimulationIds(studentId, bearerToken);
    return assigned.has(String(scenarioId));
  }

  private getEducatorBaseUrl(): string {
    const raw = process.env.EDUCATOR_BASE_URL?.trim();
    if (!raw) {
      ScenarioAssignmentService.logger.error(
        'EDUCATOR_BASE_URL is not configured — cannot verify scenario assignments',
      );
      throw new ServiceUnavailableException('Scenario assignment verification is not configured');
    }
    return raw.replace(/\/+$/, '');
  }

  private static extractAssignedIds(
    payload: EducatorAssignmentResponse | null | undefined,
  ): Set<string> {
    const ids = new Set<string>();
    if (!payload || typeof payload !== 'object') {
      return ids;
    }

    const inner: EducatorAssignmentPayload = payload.data ?? payload;

    for (const sim of inner.simulations ?? []) {
      const id = sim?.id ?? sim?.simulation_id ?? sim?.simulationId;
      if (id !== undefined && id !== null && String(id).length > 0) {
        ids.add(String(id));
      }
    }

    for (const cs of inner.classSimulations ?? []) {
      const id = cs?.simulation_id ?? cs?.simulationId;
      if (id !== undefined && id !== null && String(id).length > 0) {
        ids.add(String(id));
      }
    }

    return ids;
  }
}
