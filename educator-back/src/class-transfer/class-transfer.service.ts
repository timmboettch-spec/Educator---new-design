import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FindOptionsWhere } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { ClsService } from 'nestjs-cls';
import { LoggerService } from '../common/services';

import type { ClassTransferDto, ClassTransferAuditQueryDto } from './dto/class-transfer.dto';
import { CommonStatus } from '../common/enums/status.enum';
import { resolveEducatorEmail, resolveEducatorStatus } from '../common/utils/educator-identity.util';
import { ServiceResponse } from '../common/types';
import { ClassTransferConstants } from './class-transfer.constants';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { Class, ClassTransferAudit, Educator } from 'src/database/entities';
import {
  CLASS_REPOSITORY,
  CLASS_TRANSFER_AUDIT_REPOSITORY,
  EDUCATOR_REPOSITORY,
  GOOGLE_SCHOOL_CONNECTION_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassRepository,
  ClassTransferAuditRepository,
  EducatorRepository,
  GoogleSchoolConnectionRepository,
} from 'src/database/repositories';
import { ResponseResult } from 'src/common/class/response.class';
import { ClassConstants, ClassTransferFailureReason } from 'src/common/constants';
import { ClassTransferConflictException } from 'src/common/exceptions/class-transfer-conflict.exception';
import {
  IClassTransferCandidate,
  IClassTransferFailureRecord,
  ICurrentUser,
} from 'src/common/interfaces';
import { CLASS_MSG } from 'src/common/messages/class.message';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { AbortSignalUtil } from 'src/common/utils/abort-signal.util';
import { handleError } from 'src/common/utils/common.util';
import { nowUtc, toUtcIsoString } from 'src/common/utils/dayjs.utils';
import { educatorBelongsToSchool } from 'src/common/utils/educator-school.util';
import { decodeI18nKey } from 'src/common/utils/i18n-key.util';
import { buildPaginationMeta, getPagination } from 'src/common/utils/pagination.util';
import { IPaginationMeta } from 'src/common/interfaces/pagination.interface';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import {
  ListTransferClassesReqDto,
  TransferClassItemResDto,
} from './dto/list-transfer-classes.dto';
import {
  ListTransferTargetEducatorsReqDto,
  TransferTargetEducatorItemResDto,
} from './dto/list-transfer-target-educators.dto';
import {
  BulkClassTransferEducatorResDto,
  BulkClassTransferFailedItemResDto,
  BulkClassTransferReqDto,
  BulkClassTransferResDto,
  BulkClassTransferredItemResDto,
} from './dto/bulk-class-transfer.dto';

@Injectable()
export class ClassTransferService {
  constructor(
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,

    @Inject(EDUCATOR_REPOSITORY)
    private readonly educatorRepo: EducatorRepository,

    @Inject(CLASS_TRANSFER_AUDIT_REPOSITORY)
    private readonly auditRepo: ClassTransferAuditRepository,

    private readonly notificationsGateway: NotificationsGateway,

    private readonly logger: LoggerService,

    @Inject(GOOGLE_SCHOOL_CONNECTION_REPOSITORY)
    private readonly googleConnectionRepo: GoogleSchoolConnectionRepository,

    private readonly i18n: I18nService,

    private readonly cls: ClsService,

    private readonly configService: ConfigService,
  ) { }

  async getEducatorClasses(educatorId: string): Promise<ServiceResponse<Class[]>> {
    const classes = await this.classRepo.findActiveByEducatorWithSchool(educatorId);

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
      relations: { userRole: { user: true } },
    });

    if (!sourceEducator) {
      throw new NotFoundException(ClassTransferConstants.ERRORS.SOURCE_EDUCATOR_NOT_FOUND);
    }

    const targetEducator = await this.educatorRepo.findOne({
      where: { id: targetEducatorId },
      relations: { userRole: { user: true } },
    });

    if (!targetEducator) {
      throw new NotFoundException(ClassTransferConstants.ERRORS.TARGET_EDUCATOR_NOT_FOUND);
    }

    if (targetEducator.deleted_at) {
      throw new BadRequestException(ClassTransferConstants.ERRORS.TARGET_EDUCATOR_DELETED);
    }

    if (!targetEducator.is_active || resolveEducatorStatus(targetEducator) !== CommonStatus.ACTIVE) {
      throw new BadRequestException(ClassTransferConstants.ERRORS.TARGET_EDUCATOR_INACTIVE);
    }

    const sourceEducatorName =
      sourceEducator.full_name ?? resolveEducatorEmail(sourceEducator) ?? sourceEducatorId;
    const targetEducatorName =
      targetEducator.full_name ?? resolveEducatorEmail(targetEducator) ?? targetEducatorId;
    const className = classEntity.class_name ?? classId;

    const audit = await this.classRepo.transferToEducator({
      classId,
      className,
      sourceEducatorId,
      sourceEducatorName,
      targetEducatorId,
      targetEducatorName,
      adminId,
      adminEmail: adminEmail ?? null,
    });

    const transferredAt = audit.transferredAt.toISOString();

    this.notificationsGateway
      .notifyClassTransferSourceEducator(
        sourceEducatorId,
        classId,
        className,
        targetEducatorName,
        transferredAt,
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to notify source educator [${sourceEducatorId}]: ${err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    this.notificationsGateway
      .notifyClassTransferTargetEducator(
        targetEducatorId,
        classId,
        className,
        sourceEducatorName,
        transferredAt,
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to notify target educator [${targetEducatorId}]: ${err instanceof Error ? err.message : String(err)
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

  /**
   * Bulk Class Transfer (RE-108): hands many of one educator's classes to another educator in a
   * single call. Each class succeeds or fails on its own, in its own transaction; problems with
   * the request as a whole (educators, admin scope) refuse it before anything moves. Independent
   * of the legacy single-class `transfer` above, which stays as-is until it is removed.
   */
  async bulkTransfer(
    currentUser: ICurrentUser,
    dto: BulkClassTransferReqDto,
  ): Promise<ResponseResult<BulkClassTransferResDto>> {
    try {
      // Stop moving classes with headroom left to record failures and respond before the
      // request timeout (`RequestTimeoutInterceptor`) fires.
      const deadline = nowUtc().add(this.bulkTimeBudgetMs(), 'millisecond');
      const districtAdminId = this.resolveDistrictAdminId(currentUser);

      // `IsUUID` accepts upper case but Postgres compares uuids case-insensitively, so compare
      // normalised ids up front and the loaded rows after.
      const sourceEducatorId = dto.sourceEducatorId.toLowerCase();
      const targetEducatorId = dto.targetEducatorId.toLowerCase();
      if (sourceEducatorId === targetEducatorId) {
        throw new BadRequestException(CLASS_MSG.TRANSFER.SAME_EDUCATOR);
      }

      const [source, target] = await Promise.all([
        this.educatorRepo.findByIdForDistrictAdmin(sourceEducatorId, districtAdminId),
        this.educatorRepo.findByIdForDistrictAdmin(targetEducatorId, districtAdminId),
      ]);
      if (!source || !target) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator'));
      }
      if (source.id === target.id) {
        throw new BadRequestException(CLASS_MSG.TRANSFER.SAME_EDUCATOR);
      }
      if (!this.isEducatorActive(source)) {
        throw new BadRequestException(CLASS_MSG.TRANSFER.SOURCE_INACTIVE);
      }
      if (!this.isEducatorActive(target)) {
        throw new BadRequestException(CLASS_MSG.TRANSFER.TARGET_INACTIVE);
      }

      // Postgres returns uuids lowercase; normalise so lookups and duplicates compare equal.
      const classIds = [...new Set(dto.classIds.map((classId) => classId.toLowerCase()))];
      const candidates = await this.classRepo.findTransferCandidates(classIds, districtAdminId);
      const candidatesById = new Map(candidates.map((c) => [c.id.toLowerCase(), c]));
      const googleConnectedSchoolIds = await this.findGoogleConnectedSchoolIds(target, candidates);

      const batchId = randomUUID();
      const sourceRef = this.toEducatorRef(source);
      const targetRef = this.toEducatorRef(target);
      const adminEmail = currentUser.email ?? null;

      const transferred: BulkClassTransferredItemResDto[] = [];
      const failed: BulkClassTransferFailedItemResDto[] = [];
      const failureRecords: IClassTransferFailureRecord[] = [];

      const recordFailure = (
        classId: string,
        candidate: IClassTransferCandidate | null,
        reason: ClassTransferFailureReason,
      ): void => {
        failed.push(this.toFailedItem(classId, candidate, reason, targetRef.name));
        // Only classes in this admin's scope are audited — nothing is recorded about rows that
        // don't exist or belong to another admin.
        if (candidate) {
          failureRecords.push({
            batchId,
            classId: candidate.id,
            className: candidate.className,
            sourceEducatorId: sourceRef.id,
            sourceEducatorName: sourceRef.name,
            targetEducatorId: targetRef.id,
            targetEducatorName: targetRef.name,
            adminId: currentUser.userId,
            adminEmail,
            reason,
          });
        }
      };

      // Sequential on purpose: one pooled connection, and no lock-ordering deadlocks on `students`.
      for (const [index, classId] of classIds.entries()) {
        if (!nowUtc().isBefore(deadline) || AbortSignalUtil.isAborted(this.cls)) {
          // Out of time: every class not yet attempted is reported as NOT_PROCESSED, untouched.
          const remaining = classIds.slice(index);
          for (const remainingId of remaining) {
            recordFailure(
              remainingId,
              candidatesById.get(remainingId) ?? null,
              ClassTransferFailureReason.NOT_PROCESSED,
            );
          }
          this.logger.warn(
            `Bulk class transfer [${batchId}] ran out of time: ${remaining.length} of ${classIds.length} classes not processed`,
          );
          break;
        }

        const candidate = candidatesById.get(classId) ?? null;
        const reason = this.evaluateCandidate(candidate, source, target, googleConnectedSchoolIds);
        if (reason || !candidate) {
          recordFailure(classId, candidate, reason ?? ClassTransferFailureReason.CLASS_NOT_FOUND);
          continue;
        }

        try {
          const audit = await this.classRepo.transferClassInBatch({
            batchId,
            classId: candidate.id,
            className: candidate.className,
            sourceEducatorId: sourceRef.id,
            sourceEducatorName: sourceRef.name,
            targetEducatorId: targetRef.id,
            targetEducatorName: targetRef.name,
            adminId: currentUser.userId,
            adminEmail,
          });
          transferred.push({
            classId: candidate.id,
            className: candidate.className,
            auditId: audit.id,
            transferredAt: toUtcIsoString(audit.transferredAt),
            notice: candidate.googleCourseId
              ? this.translate(CLASS_MSG.TRANSFER.GOOGLE_ADD_TARGET_TO_COURSE(targetRef.name))
              : null,
          });
        } catch (error) {
          if (error instanceof ClassTransferConflictException) {
            recordFailure(classId, candidate, error.reason);
          } else {
            this.logger.error(
              `Bulk class transfer [${batchId}] failed for class [${candidate.id}]: ${
                error instanceof Error ? (error.stack ?? error.message) : String(error)
              }`,
            );
            recordFailure(classId, candidate, ClassTransferFailureReason.TRANSFER_FAILED);
          }
        }
      }

      await this.writeFailureAudits(batchId, failureRecords);

      // When the last class in this batch was transferred; null when none was.
      const transferredAt = transferred.at(-1)?.transferredAt ?? null;
      if (transferredAt) {
        this.notifyEducators(batchId, sourceRef, targetRef, transferred, transferredAt);
      }

      this.logger.log(
        `Bulk class transfer [${batchId}] by admin [${currentUser.userId}] from educator [${sourceRef.id}] to [${targetRef.id}]: ${transferred.length} transferred, ${failed.length} failed of ${classIds.length}`,
      );

      return new ResponseResult({
        message: CLASS_MSG.TRANSFER.BULK_COMPLETED(transferred.length, classIds.length),
        data: {
          batchId,
          sourceEducator: sourceRef,
          targetEducator: targetRef,
          requestedCount: classIds.length,
          transferredCount: transferred.length,
          failedCount: failed.length,
          transferredAt,
          transferred,
          failed,
        },
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * One page of an educator's classes for the Class Transfer picker, each flagged with whether it
   * can be transferred and why not. With `targetEducatorId`, the receiver-dependent rules (school,
   * Google Classroom) are applied too, exactly as the bulk transfer applies them. Read-only, so a
   * source educator who is no longer active can still be listed.
   */
  async listTransferClasses(
    currentUser: ICurrentUser,
    educatorId: string,
    dto: ListTransferClassesReqDto,
  ): Promise<ResponseResult<TransferClassItemResDto[], IPaginationMeta>> {
    try {
      const districtAdminId = this.resolveDistrictAdminId(currentUser);
      const sourceEducatorId = educatorId.toLowerCase();
      const targetEducatorId = dto.targetEducatorId?.toLowerCase();
      if (targetEducatorId === sourceEducatorId) {
        throw new BadRequestException(CLASS_MSG.TRANSFER.SAME_EDUCATOR);
      }

      const [source, target] = await Promise.all([
        this.educatorRepo.findByIdForDistrictAdmin(sourceEducatorId, districtAdminId),
        targetEducatorId
          ? this.educatorRepo.findByIdForDistrictAdmin(targetEducatorId, districtAdminId)
          : Promise.resolve(null),
      ]);
      if (!source || (targetEducatorId && !target)) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator'));
      }
      if (target && target.id === source.id) {
        throw new BadRequestException(CLASS_MSG.TRANSFER.SAME_EDUCATOR);
      }
      if (target && !this.isEducatorActive(target)) {
        throw new BadRequestException(CLASS_MSG.TRANSFER.TARGET_INACTIVE);
      }

      const { page, pageSize, skip, take } = getPagination({
        page: dto.page,
        pageSize: dto.pageSize,
      });
      const { rows, total } = await this.classRepo.findTransferClassesForEducator(source.id, {
        search: dto.search?.trim() || undefined,
        transferableOnly: dto.transferableOnly === true,
        sortBy: dto.sortBy,
        sortDir: dto.sortDir === 'desc' ? 'DESC' : 'ASC',
        skip,
        take,
      });

      const googleConnectedSchoolIds = target
        ? await this.findGoogleConnectedSchoolIds(target, rows)
        : new Set<string>();
      const targetName = target ? this.toEducatorRef(target).name : '';

      const data: TransferClassItemResDto[] = rows.map((row) => {
        const reasonCode = this.evaluateCandidate(row, source, target, googleConnectedSchoolIds);
        return {
          classId: row.id,
          className: row.className,
          status: row.status,
          isActive: row.isActive === true,
          startDate: row.startDate,
          endDate: row.endDate,
          studentsCount: row.studentsCount,
          schoolId: row.schoolId,
          schoolName: row.schoolName,
          googleLinked: Boolean(row.googleCourseId),
          transferable: reasonCode === null,
          reasonCode,
          reason: reasonCode ? this.translate(this.reasonMessageKey(reasonCode, targetName)) : null,
        };
      });

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Classes'),
        data,
        meta: buildPaginationMeta(total, page, pageSize),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /** How long a bulk transfer may spend moving classes: a share of the request timeout. */
  private bulkTimeBudgetMs(): number {
    const apiTimeoutMs = this.configService.get<number>('app.apiTimeoutMs') ?? 60_000;
    return apiTimeoutMs * ClassConstants.TRANSFER.BULK_TIME_BUDGET_RATIO;
  }

  /**
   * Educators the source educator's classes can be handed to, for the "Transfer to" picker. Only
   * educators the bulk transfer would accept as the receiver are listed.
   */
  async listTransferTargetEducators(
    currentUser: ICurrentUser,
    educatorId: string,
    dto: ListTransferTargetEducatorsReqDto,
  ): Promise<ResponseResult<TransferTargetEducatorItemResDto[], IPaginationMeta>> {
    try {
      const districtAdminId = this.resolveDistrictAdminId(currentUser);
      const source = await this.educatorRepo.findByIdForDistrictAdmin(
        educatorId.toLowerCase(),
        districtAdminId,
      );
      if (!source) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator'));
      }

      const { page, pageSize, skip, take } = getPagination({
        page: dto.page,
        pageSize: dto.pageSize,
      });
      const { rows, total } = await this.educatorRepo.findTransferTargetsForDistrictAdmin(
        districtAdminId,
        source.id,
        {
          search: dto.search?.trim() || undefined,
          sortBy: dto.sortBy,
          sortDir: dto.sortDir === 'desc' ? 'DESC' : 'ASC',
          skip,
          take,
        },
      );

      const data: TransferTargetEducatorItemResDto[] = rows.map((row) => ({
        educatorId: row.id,
        // Same display-name fallback as the bulk transfer's educator refs.
        name: row.fullName ?? row.email ?? row.id,
        email: row.email,
        schoolsCount: row.schoolsCount,
      }));

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Educators'),
        data,
        meta: buildPaginationMeta(total, page, pageSize),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /** The acting district admin's `district_admin_id` — set only on ADMIN-type tokens. */
  private resolveDistrictAdminId(currentUser: ICurrentUser): string {
    const adminId = String(currentUser.adminId ?? '').trim();
    if (!adminId) {
      throw new BadRequestException(CLASS_MSG.TRANSFER.MISSING_ADMIN);
    }
    return adminId;
  }

  /** Same rule for both educators: the profile is active and the educator role is ACTIVE. */
  private isEducatorActive(educator: Educator): boolean {
    return educator.is_active === true && resolveEducatorStatus(educator) === CommonStatus.ACTIVE;
  }

  /**
   * Per-class checks, first failure wins. `null` means the class can be transferred. A class the
   * loader didn't return (missing, or another admin's) and a soft-deleted one both read as not
   * found. Without a target, only the receiver-independent rules apply.
   */
  private evaluateCandidate(
    candidate: IClassTransferCandidate | null,
    source: Educator,
    target: Educator | null,
    googleConnectedSchoolIds: Set<string>,
  ): ClassTransferFailureReason | null {
    if (!candidate || candidate.deletedAt) {
      return ClassTransferFailureReason.CLASS_NOT_FOUND;
    }
    // Same rule as the legacy single transfer: only `true` passes, `NULL` does not.
    if (candidate.isActive !== true) {
      return ClassTransferFailureReason.CLASS_INACTIVE;
    }
    // Archived classes can't be handed over; every other status (INACTIVE, DRAFT, …) can.
    if (ClassConstants.TRANSFER.BLOCKED_STATUSES.includes(candidate.status)) {
      return ClassTransferFailureReason.CLASS_ARCHIVED;
    }
    if (candidate.educatorId !== source.id) {
      return ClassTransferFailureReason.CLASS_NOT_OWNED_BY_SOURCE;
    }
    if (!target) {
      return null;
    }
    if (candidate.schoolId && !educatorBelongsToSchool(target, candidate.schoolId)) {
      return ClassTransferFailureReason.TARGET_NOT_IN_CLASS_SCHOOL;
    }
    if (
      candidate.googleCourseId &&
      (!candidate.schoolId || !googleConnectedSchoolIds.has(candidate.schoolId))
    ) {
      return ClassTransferFailureReason.TARGET_NO_GOOGLE_CONNECTION;
    }
    return null;
  }

  /** Schools where the target has a Google connection, among those of Google-linked classes. */
  private async findGoogleConnectedSchoolIds(
    target: Educator,
    candidates: IClassTransferCandidate[],
  ): Promise<Set<string>> {
    const schoolIds = [
      ...new Set(
        candidates.filter((c) => c.googleCourseId && c.schoolId).map((c) => c.schoolId as string),
      ),
    ];
    if (schoolIds.length === 0) {
      return new Set();
    }
    return new Set(await this.googleConnectionRepo.findConnectedSchoolIds(target.id, schoolIds));
  }

  /** FAILED audit rows, written after (never inside) the classes' rolled-back transactions. */
  private async writeFailureAudits(
    batchId: string,
    records: IClassTransferFailureRecord[],
  ): Promise<void> {
    try {
      await this.auditRepo.recordFailures(records);
    } catch (error) {
      // The transfer outcome is authoritative; losing failure audits must not change it.
      this.logger.error(
        `Bulk class transfer [${batchId}]: failed to write ${records.length} FAILED audit rows: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** One summary per educator, fire-and-forget: a notification failure never fails the transfer. */
  private notifyEducators(
    batchId: string,
    source: BulkClassTransferEducatorResDto,
    target: BulkClassTransferEducatorResDto,
    transferred: BulkClassTransferredItemResDto[],
    transferredAt: string,
  ): void {
    const classIds = transferred.map((item) => item.classId);
    const classNames = transferred.map((item) => item.className);
    const logFailure = (educatorId: string) => (error: unknown) => {
      this.logger.error(
        `Bulk class transfer [${batchId}]: failed to notify educator [${educatorId}]: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    };

    this.notificationsGateway
      .notifyClassesTransferredSource(source.id, {
        batchId,
        classIds,
        classNames,
        otherEducatorName: target.name,
        transferredAt,
      })
      .catch(logFailure(source.id));

    this.notificationsGateway
      .notifyClassesTransferredTarget(target.id, {
        batchId,
        classIds,
        classNames,
        otherEducatorName: source.name,
        transferredAt,
      })
      .catch(logFailure(target.id));
  }

  private toEducatorRef(educator: Educator): BulkClassTransferEducatorResDto {
    return {
      id: educator.id,
      name: educator.full_name ?? resolveEducatorEmail(educator) ?? educator.id,
    };
  }

  private toFailedItem(
    classId: string,
    candidate: IClassTransferCandidate | null,
    reason: ClassTransferFailureReason,
    targetName: string,
  ): BulkClassTransferFailedItemResDto {
    return {
      classId: candidate?.id ?? classId,
      className: candidate?.className ?? null,
      reasonCode: reason,
      reason: this.translate(this.reasonMessageKey(reason, targetName)),
    };
  }

  private reasonMessageKey(reason: ClassTransferFailureReason, targetName: string): string {
    const message = CLASS_MSG.TRANSFER.REASON[reason];
    return typeof message === 'function' ? message(targetName) : message;
  }

  /**
   * `ResponseInterceptor` translates only the envelope's `message`, so per-class text inside
   * `data` is translated here, in the caller's language.
   */
  private translate(message: string): string {
    const { key, args } = decodeI18nKey(message);
    return this.i18n.t(key, { lang: I18nContext.current()?.lang, args });
  }
}
