import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Simulation } from './entity/simulation.entity';
import { BlobScenario, ServiceResponse } from 'src/common/types';
import { ErrorTypes } from 'src/common/utils/messages';
import { SimulationConstants } from './simulations.constant';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';

@Injectable()
export class SimulationsService {
  private readonly logger = new Logger(SimulationsService.name);

  constructor(
    @InjectRepository(Simulation)
    private readonly simRepo: Repository<Simulation>,
    private readonly tutorPatientService: TutorPatientService,
  ) {}

  async findAllWithDetails(): Promise<ServiceResponse<BlobScenario[]>> {
    try {
      const data = await this.tutorPatientService.getAllSimulationData();
      return {
        success: true,
        message: SimulationConstants.MESSAGES.ALL_FETCHED,
        data: data as BlobScenario[],
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
  }

  async findAll(): Promise<ServiceResponse<Simulation[]>> {
    try {
      const data = await this.tutorPatientService.getScenarios();
      return {
        success: true,
        message: SimulationConstants.MESSAGES.ALL_FETCHED,
        data: data as Simulation[],
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
  }

  async findById(id: string): Promise<ServiceResponse<Simulation>> {
    try {
      const scenarios = (await this.tutorPatientService.getScenarios()) as Simulation[];
      const item = scenarios.find((s) => s.id === id);
      if (!item) {
        return {
          success: false,
          message: SimulationConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      return {
        success: true,
        message: SimulationConstants.MESSAGES.FETCHED,
        data: item,
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
  }

  async findByUnitId(unit_id: string, ls?: string): Promise<ServiceResponse<Simulation[]>> {
    try {
      const enData = (await this.tutorPatientService.getScenarios()) as Array<
        Record<string, unknown>
      >;
      const enFiltered = enData.filter((s) => (s['unitId'] ?? s['unit_id']) === unit_id);

      if (!ls || ls === 'en') {
        return {
          success: true,
          message: SimulationConstants.MESSAGES.ALL_FETCHED,
          data: enFiltered as unknown as Simulation[],
        };
      }

      // Overlay localized scenarios on top of English — untranslated ones fall back to English
      const localizedData = (await this.tutorPatientService.getScenarios(ls)) as Array<
        Record<string, unknown>
      >;
      const localizedById = new Map<string, Record<string, unknown>>(
        localizedData.map((s) => [(s['id'] ?? s['scenarioId'] ?? '') as string, s]),
      );

      const merged = enFiltered.map(
        (s) => localizedById.get((s['id'] ?? s['scenarioId'] ?? '') as string) ?? s,
      );
      return {
        success: true,
        message: SimulationConstants.MESSAGES.ALL_FETCHED,
        data: merged as unknown as Simulation[],
      };
    } catch (error) {
      return {
        success: false,
        message: (error as Error).message,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
  }
}
