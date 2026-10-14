import { Inject, Injectable } from '@nestjs/common';
import { FindOptionsWhere, IsNull, QueryFailedError } from 'typeorm';
import { LmsAssignmentMapping } from 'src/database/entities';
import {
  CLASS_SIMULATION_REPOSITORY,
  LMS_ASSIGNMENT_MAPPING_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassSimulationRepository,
  LmsAssignmentMappingRepository,
} from 'src/database/repositories';
import { LoggerService } from '../../common/services';

export interface CreateAssignmentMappingDto {
  schoolId: string;
  classId: string;
  simulationId?: string;
  classSimulationId?: string;
  lmsLineItemUrl: string;
  lmsLineItemLabel?: string;
  lmsResourceLinkId?: string;
  lmsClientId?: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    typeof error.driverError === 'object' &&
    error.driverError !== null &&
    (error.driverError as { code?: string }).code === '23505'
  );
}

/**
 * Service for managing LMS assignment mappings (portal simulations → LMS gradebook line items).
 * Used to link simulations to LMS gradebook columns for grade passback.
 */
@Injectable()
export class LmsAssignmentService {
  constructor(
    @Inject(LMS_ASSIGNMENT_MAPPING_REPOSITORY)
    private readonly assignmentMappingRepo: LmsAssignmentMappingRepository,
    @Inject(CLASS_SIMULATION_REPOSITORY)
    private readonly classSimulationRepo: ClassSimulationRepository,
    private readonly logger: LoggerService,
  ) {}

  /**
   * When a class has exactly one active simulation assignment, infer it for AGS mapping.
   */
  async inferSingleClassSimulation(
    classId: string,
  ): Promise<{ simulationId: string; classSimulationId: string } | null> {
    const assignments = await this.classSimulationRepo.find({
      where: { class_id: classId, is_active: true, deleted_at: IsNull() },
    });

    if (assignments.length !== 1) {
      return null;
    }

    const [assignment] = assignments;
    return {
      simulationId: assignment.simulation_id,
      classSimulationId: assignment.id,
    };
  }

  async resolveLaunchSimulation(
    classId: string,
    customSimulationId: string | null,
  ): Promise<{ simulationId: string; classSimulationId: string } | null> {
    if (customSimulationId) {
      const [assignment] = await this.classSimulationRepo.findActiveByClassIdsAndSimulationIds(
        [classId],
        [customSimulationId],
      );
      if (assignment) {
        return { simulationId: assignment.simulation_id, classSimulationId: assignment.id };
      }
      this.logger.warn(
        `[AGS Capture] custom_simulation_id ${customSimulationId} is not assigned to class ${classId}; falling back to inference`,
      );
    }
    return this.inferSingleClassSimulation(classId);
  }

  /**
   * Attach simulation IDs to an existing class AGS mapping (e.g. after LTI launch or sim start).
   */
  async linkSimulationToMapping(params: {
    classId: string;
    simulationId: string;
    classSimulationId?: string;
    lmsResourceLinkId?: string;
  }): Promise<LmsAssignmentMapping | null> {
    const { classId, simulationId, classSimulationId, lmsResourceLinkId } = params;

    const lookups: Array<Promise<LmsAssignmentMapping | null>> = [];

    if (lmsResourceLinkId) {
      lookups.push(
        this.assignmentMappingRepo.findOne({
          where: { classId, lmsResourceLinkId },
        }),
      );
    } else {
      lookups.push(Promise.resolve(null));
    }

    lookups.push(
      this.assignmentMappingRepo.findOne({
        where: { classId, simulationId: IsNull() },
        order: { createdAt: 'DESC' },
      }),
      this.assignmentMappingRepo.findOne({
        where: { classId, simulationId },
      }),
    );

    const [byResourceLink, byNullSimulation, bySimulation] = await Promise.all(lookups);
    const mapping = byResourceLink ?? byNullSimulation ?? bySimulation;

    if (!mapping) {
      return null;
    }

    mapping.simulationId = simulationId;
    if (classSimulationId) {
      mapping.classSimulationId = classSimulationId;
    }

    const saved = await this.assignmentMappingRepo.save(mapping);
    this.logger.log(
      `[AGS Mapping] Linked simulation ${simulationId} to mapping ${saved.id} for class ${classId}`,
    );
    return saved;
  }

  /**
   * Create or update an assignment mapping.
   * Uses resource_link_id as unique identifier when provided (for multi-class scenarios).
   * Otherwise uses (class_id + simulation_id) or (class_id + class_simulation_id).
   */
  async upsertMapping(dto: CreateAssignmentMappingDto): Promise<LmsAssignmentMapping> {
    const {
      schoolId,
      classId,
      simulationId,
      classSimulationId,
      lmsLineItemUrl,
      lmsLineItemLabel,
      lmsResourceLinkId,
      lmsClientId,
    } = dto;

    let existingMapping: LmsAssignmentMapping | null = null;

    if (lmsResourceLinkId) {
      existingMapping = await this.assignmentMappingRepo.findOne({
        where: {
          classId,
          lmsResourceLinkId,
        },
      });
    }

    if (!existingMapping && (simulationId || classSimulationId)) {
      const where: FindOptionsWhere<LmsAssignmentMapping> = { classId };
      if (simulationId) {
        where.simulationId = simulationId;
      }
      if (classSimulationId) {
        where.classSimulationId = classSimulationId;
      }

      existingMapping = await this.assignmentMappingRepo.findOne({ where });
    }

    if (existingMapping) {
      return this.updateExistingMapping(existingMapping, dto);
    }

    const mapping = this.assignmentMappingRepo.create({
      schoolId,
      classId,
      simulationId: simulationId ?? null,
      classSimulationId: classSimulationId ?? null,
      lmsLineItemUrl,
      lmsLineItemLabel: lmsLineItemLabel ?? null,
      lmsResourceLinkId: lmsResourceLinkId ?? null,
      lmsClientId: lmsClientId ?? null,
    });

    try {
      const saved = await this.assignmentMappingRepo.save(mapping);
      this.logger.log(
        `[AGS Mapping] Created mapping ${saved.id} for class ${classId} sim ${simulationId ?? classSimulationId ?? '(none)'} → ${lmsLineItemUrl}`,
      );
      return saved;
    } catch (error) {
      if (lmsResourceLinkId && isUniqueViolation(error)) {
        const raced = await this.assignmentMappingRepo.findOne({
          where: { classId, lmsResourceLinkId },
        });
        if (raced) {
          return this.updateExistingMapping(raced, dto);
        }
      }
      throw error;
    }
  }

  private async updateExistingMapping(
    existingMapping: LmsAssignmentMapping,
    dto: CreateAssignmentMappingDto,
  ): Promise<LmsAssignmentMapping> {
    const {
      schoolId,
      classId,
      simulationId,
      classSimulationId,
      lmsLineItemUrl,
      lmsLineItemLabel,
      lmsResourceLinkId,
      lmsClientId,
    } = dto;

    existingMapping.schoolId = schoolId;
    existingMapping.lmsLineItemUrl = lmsLineItemUrl;
    if (lmsLineItemLabel) existingMapping.lmsLineItemLabel = lmsLineItemLabel;
    if (lmsResourceLinkId) existingMapping.lmsResourceLinkId = lmsResourceLinkId;
    if (lmsClientId) existingMapping.lmsClientId = lmsClientId;
    if (simulationId) existingMapping.simulationId = simulationId;
    if (classSimulationId) existingMapping.classSimulationId = classSimulationId;

    const updated = await this.assignmentMappingRepo.save(existingMapping);
    this.logger.log(
      `[AGS Mapping] Updated mapping ${updated.id} for class ${classId} → ${lmsLineItemUrl}`,
    );
    return updated;
  }

  async findMapping(
    classId: string,
    simulationId: string,
    resourceLinkId?: string,
  ): Promise<LmsAssignmentMapping | null> {
    // Priority 1: If resourceLinkId is provided, try exact match first
    if (resourceLinkId) {
      const byResourceLink = await this.assignmentMappingRepo.findOne({
        where: { classId, lmsResourceLinkId: resourceLinkId },
      });
      if (byResourceLink) {
        this.logger.debug(
          `[AGS Mapping] Found mapping by resourceLinkId=${resourceLinkId} for class ${classId}`,
        );
        return byResourceLink;
      }
    }

    // Priority 2: Lookup by simulationId (backwards compat, manual flow)
    const [direct, classSimulation] = await Promise.all([
      this.assignmentMappingRepo.findOne({
        where: { classId, simulationId },
      }),
      this.classSimulationRepo.findOne({
        where: {
          class_id: classId,
          simulation_id: simulationId,
          is_active: true,
          deleted_at: IsNull(),
        },
      }),
    ]);

    if (direct) {
      return direct;
    }

    return this.linkSimulationToMapping({
      classId,
      simulationId,
      classSimulationId: classSimulation?.id,
    });
  }

  async findByClass(classId: string): Promise<LmsAssignmentMapping[]> {
    return this.assignmentMappingRepo.find({
      where: { classId },
      order: { createdAt: 'DESC' },
    });
  }
}
