import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  GOOGLE_STUDENT_MAPPING_REPOSITORY,
} from 'src/database/tokens';
import { GoogleStudentMappingRepository } from 'src/database/repositories';
import { StudentsService } from 'src/students/students.service';
import { StudentLoginData } from 'src/students/interfaces/student-profile.interface';
import { GoogleConstants } from './google.constants';

export type GoogleStudentLoginResult = StudentLoginData & {
  google_email: string | null;
  google_course_id: string | null;
  google_sub: string;
};

@Injectable()
export class GoogleStudentLoginService {
  constructor(
    @Inject(GOOGLE_STUDENT_MAPPING_REPOSITORY)
    private readonly studentMappingRepo: GoogleStudentMappingRepository,
    @Inject(forwardRef(() => StudentsService))
    private readonly studentsService: StudentsService,
  ) {}

  /**
   * Roster map + studentLogin from an already-resolved Google profile
   * (used after authorization-code exchange in the Classroom OAuth callback).
   */
  async loginWithGoogleUserProfile(params: {
    googleUserId: string;
    email: string | null;
    googleCourseId?: string | null;
    simulationId?: string | null;
    res: Response;
  }): Promise<GoogleStudentLoginResult> {
    const mapping = await this.resolveMapping(params.googleUserId, params.googleCourseId);

    const result = await this.studentsService.studentLogin(
      mapping.studentCode,
      params.res,
      params.simulationId?.trim()
        ? { simulationId: params.simulationId.trim(), classId: mapping.classId }
        : undefined,
    );

    if (!result.success || !result.data) {
      throw new BadRequestException(
        result.message || GoogleConstants.MESSAGES.STUDENT_LOGIN_FAILED,
      );
    }

    return {
      ...result.data,
      google_email: params.email,
      google_course_id: mapping.googleCourseId,
      google_sub: params.googleUserId,
    };
  }

  private async resolveMapping(
    googleUserId: string,
    googleCourseId?: string | null,
  ) {
    const courseId = googleCourseId?.trim() || '';
    if (courseId) {
      const byCourse = await this.studentMappingRepo.findByGoogleUserIdAndCourse(
        googleUserId,
        courseId,
      );
      if (!byCourse?.studentCode) {
        throw new NotFoundException(GoogleConstants.MESSAGES.STUDENT_NOT_IN_ROSTER);
      }
      return byCourse;
    }

    const mappings = await this.studentMappingRepo.findByGoogleUserId(googleUserId);
    if (mappings.length === 0) {
      throw new NotFoundException(GoogleConstants.MESSAGES.STUDENT_NOT_IN_ROSTER);
    }
    if (mappings.length > 1) {
      throw new BadRequestException(GoogleConstants.MESSAGES.STUDENT_MULTIPLE_CLASSES);
    }
    return mappings[0];
  }
}
