import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { Class } from '../class/entity/class.entity';
import { Educator } from '../educators/entity/educator.entity';
import { Student } from '../students/entity/students.entity';
import { ClassSimulation } from '../class-simulations/entity/class-simulation.entity';
import { EducatorSimulation } from '../educator-simulations/entity/educator-simulation.entity';
import { ClassTransferAudit, ClassTransferStatus } from './entity/class-transfer-audit.entity';
import type { ClassTransferDto, ClassTransferAuditQueryDto } from './dto/class-transfer.dto';
import { CommonStatus } from '../common/enums/status.enum';
import { ServiceResponse } from '../common/types';
import { ClassTransferConstants } from './class-transfer.constants';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class ClassTransferService {
  private readonly logger = new Logger(ClassTransferService.name);

  constructor(
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,

    @InjectRepository(Educator)
    private readonly educatorRepo: Repository<Educator>,

    @InjectRepository(ClassSimulation)
    private readonly classSimulationRepo: Repository<ClassSimulation>,

    @InjectRepository(EducatorSimulation)
    private readonly educatorSimulationRepo: Repository<EducatorSimulation>,

    @InjectRepository(ClassTransferAudit)
    private readonly auditRepo: Repository<ClassTransferAudit>,

    private readonly dataSource: DataSource,

    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async getEducatorClasses(educatorId: string): Promise<ServiceResponse<Class[]>> {
    const classes = await this.classRepo
      .createQueryBuilder('c')
      .select([
        'c.id',
        'c.class_name',
        'c.term',
        'c.year',
        'c.status',
        'c.start_date',
        'c.end_date',
        'c.is_active',
        'c.total_no_of_students',
        'c.school_id',
        's.school_name',
      ])
      .leftJoin('c.school', 's')
      .where('c.educator_id = :educatorId', { educatorId })
      .andWhere('(c.is_active = :active OR c.is_active IS NULL)', { active: true })
      .andWhere('c.deleted_at IS NULL')
      .orderBy('c.created_at', 'DESC')
      .getMany();

    return {
      success: true,
      message: 'Classes fetched successfully',
      data: classes,
    };
  }

  async transfer(
    dto: ClassTransferDto,
    adminId: string,
    adminEmail?: string,
  ): Promise<ServiceResponse<ClassTransferAudit>> {
    const { classId, targetEducatorId } = dto;

    const classEntity = await this.classRepo.findOne({
      where: { id: classId },
      relations: ['educator'],
    });

    if (!classEntity) {
      throw new NotFoundException(ClassTransferConstants.ERRORS.CLASS_NOT_FOUND);
    }

    if (classEntity.deleted_at) {
      throw new BadRequestException(ClassTransferConstants.ERRORS.CLASS_DELETED);
    }

    if (!classEntity.is_active) {
      throw new BadRequestException(ClassTransferConstants.ERRORS.CLASS_INACTIVE);
    }

    if (!classEntity.educator_id) {
      throw new BadRequestException(ClassTransferConstants.ERRORS.CLASS_HAS_NO_OWNER);
    }

    const sourceEducatorId = classEntity.educator_id;

    if (sourceEducatorId === targetEducatorId) {
      throw new BadRequestException(ClassTransferConstants.ERRORS.SAME_EDUCATOR);
    }

    const sourceEducator = await this.educatorRepo.findOne({
      where: { id: sourceEducatorId },
    });

    if (!sourceEducator) {
      throw new NotFoundException(ClassTransferConstants.ERRORS.SOURCE_EDUCATOR_NOT_FOUND);
    }

    const targetEducator = await this.educatorRepo.findOne({
      where: { id: targetEducatorId },
    });

    if (!targetEducator) {
      throw new NotFoundException(ClassTransferConstants.ERRORS.TARGET_EDUCATOR_NOT_FOUND);
    }

    if (targetEducator.deleted_at) {
      throw new BadRequestException(ClassTransferConstants.ERRORS.TARGET_EDUCATOR_DELETED);
    }

    if (!targetEducator.is_active || targetEducator.status !== CommonStatus.ACTIVE) {
      throw new BadRequestException(ClassTransferConstants.ERRORS.TARGET_EDUCATOR_INACTIVE);
    }

    const sourceEducatorName = sourceEducator.full_name ?? sourceEducator.email;
    const targetEducatorName = targetEducator.full_name ?? targetEducator.email;
    const className = classEntity.class_name ?? classId;

    const audit = await this.dataSource.transaction(async (manager) => {
      await manager.update(Class, { id: classId }, { educator_id: targetEducatorId });

      await manager.update(Student, { class_id: classId }, { educator_id: targetEducatorId });

      const auditRecord = manager.create(ClassTransferAudit, {
        classId,
        className,
        sourceEducatorId,
        sourceEducatorName,
        targetEducatorId,
        targetEducatorName,
        adminId,
        adminEmail: adminEmail ?? null,
        status: ClassTransferStatus.SUCCESS,
        notes: null,
      });

      return manager.save(ClassTransferAudit, auditRecord);
    });

    this.syncSimulationLibrary(classId, sourceEducatorId, targetEducatorId).catch(
      (err: unknown) => {
        this.logger.warn(
          `Simulation library sync failed for class [${classId}]: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      },
    );

    const transferredAt = audit.transferredAt.toISOString();

    this.notificationsGateway
      .notifyClassTransferSourceEducator(
        sourceEducatorId,
        className,
        targetEducatorName,
        transferredAt,
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to notify source educator [${sourceEducatorId}]: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    this.notificationsGateway
      .notifyClassTransferTargetEducator(
        targetEducatorId,
        className,
        sourceEducatorName,
        transferredAt,
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to notify target educator [${targetEducatorId}]: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    this.logger.log(
      `Class [${classId}] transferred from educator [${sourceEducatorId}] to [${targetEducatorId}] by admin [${adminId}]`,
    );

    return {
      success: true,
      message: ClassTransferConstants.MESSAGES.TRANSFER_SUCCESS,
      data: audit,
    };
  }

  private async syncSimulationLibrary(
    classId: string,
    sourceEducatorId: string,
    targetEducatorId: string,
  ): Promise<void> {
    const classSimulations = await this.classSimulationRepo.find({
      where: { class_id: classId, is_active: true },
    });

    if (classSimulations.length === 0) return;

    const scenarioIds = classSimulations.map((cs) => cs.simulation_id);

    const sourceEntries = await this.educatorSimulationRepo
      .createQueryBuilder('es')
      .where('es.educator_id = :sourceId', { sourceId: sourceEducatorId })
      .andWhere('es.scenario_id IN (:...scenarioIds)', { scenarioIds })
      .andWhere('es.deleted_at IS NULL')
      .getMany();

    const targetEntries = await this.educatorSimulationRepo
      .createQueryBuilder('es')
      .where('es.educator_id = :targetId', { targetId: targetEducatorId })
      .andWhere('es.scenario_id IN (:...scenarioIds)', { scenarioIds })
      .getMany();

    const sourceByScenario = new Map(sourceEntries.map((e) => [e.scenario_id, e]));
    const targetByScenario = new Map(targetEntries.map((e) => [e.scenario_id, e]));

    for (const cs of classSimulations) {
      const source = sourceByScenario.get(cs.simulation_id);
      const target = targetByScenario.get(cs.simulation_id);

      if (!target) {
        await this.educatorSimulationRepo.save(
          this.educatorSimulationRepo.create({
            educator_id: targetEducatorId,
            unit_id: source?.unit_id ?? '',
            scenario_id: cs.simulation_id,
            deleted_at: null,
          }),
        );
      } else if (target.deleted_at !== null) {
        await this.educatorSimulationRepo.update({ id: target.id }, { deleted_at: null });
      }
    }
  }

  async getAuditHistory(
    query: ClassTransferAuditQueryDto,
  ): Promise<ServiceResponse<ClassTransferAudit[]>> {
    const where: FindOptionsWhere<ClassTransferAudit> = {};

    if (query.classId) where.classId = query.classId;
    if (query.sourceEducatorId) where.sourceEducatorId = query.sourceEducatorId;
    if (query.targetEducatorId) where.targetEducatorId = query.targetEducatorId;

    const records = await this.auditRepo.find({
      where,
      order: { transferredAt: 'DESC' },
    });

    return {
      success: true,
      message: ClassTransferConstants.MESSAGES.AUDIT_FETCHED,
      data: records,
    };
  }
}
