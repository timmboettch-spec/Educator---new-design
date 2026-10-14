import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { GoogleStudentLoginService } from '../../../src/google/google-student-login.service';
import { GoogleStudentMappingRepository } from '../../../src/database/repositories';
import { StudentsService } from '../../../src/students/students.service';
import { GoogleConstants } from '../../../src/google/google.constants';

describe('GoogleStudentLoginService', () => {
  const studentMappingRepo = {
    findByGoogleUserIdAndCourse: jest.fn(),
    findByGoogleUserId: jest.fn(),
  } as unknown as jest.Mocked<GoogleStudentMappingRepository>;

  const studentsService = {
    studentLogin: jest.fn(),
  } as unknown as jest.Mocked<StudentsService>;

  const res = {} as never;
  let service: GoogleStudentLoginService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GoogleStudentLoginService(studentMappingRepo, studentsService);
  });

  it('resolves mapping by course and reuses studentLogin', async () => {
    studentMappingRepo.findByGoogleUserIdAndCourse.mockResolvedValue({
      studentCode: 'GC-ABC123',
      classId: 'class-1',
      googleCourseId: 'course-1',
    } as never);
    studentsService.studentLogin.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        id: 'st-1',
        student_id: 'GC-ABC123',
        status: 'ACTIVE' as never,
        class_id: 'class-1',
        class_name: 'Biology',
        type: 'student',
        access_token: 'jwt-1',
        token_type: 'Bearer',
      },
    });

    const result = await service.loginWithGoogleUserProfile({
      googleUserId: 'google-user-1',
      email: 'student@example.com',
      googleCourseId: 'course-1',
      simulationId: 'SIM-1',
      res,
    });

    expect(studentsService.studentLogin).toHaveBeenCalledWith(
      'GC-ABC123',
      res,
      { simulationId: 'SIM-1', classId: 'class-1' },
    );
    expect(result.student_id).toBe('GC-ABC123');
    expect(result.access_token).toBe('jwt-1');
    expect(result.google_email).toBe('student@example.com');
  });

  it('throws when Google account is not in the roster', async () => {
    studentMappingRepo.findByGoogleUserId.mockResolvedValue([]);

    await expect(
      service.loginWithGoogleUserProfile({
        googleUserId: 'unknown-user',
        email: 'x@y.com',
        res,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when the same Google user maps to multiple classes without course id', async () => {
    studentMappingRepo.findByGoogleUserId.mockResolvedValue([
      { studentCode: 'GC-1', classId: 'c1', googleCourseId: 'g1' },
      { studentCode: 'GC-2', classId: 'c2', googleCourseId: 'g2' },
    ] as never);

    await expect(
      service.loginWithGoogleUserProfile({
        googleUserId: 'google-user-1',
        email: 'x@y.com',
        res,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('surfaces studentLogin failure message', async () => {
    studentMappingRepo.findByGoogleUserId.mockResolvedValue([
      { studentCode: 'GC-1', classId: 'c1', googleCourseId: 'g1' },
    ] as never);
    studentsService.studentLogin.mockResolvedValue({
      success: false,
      message: GoogleConstants.MESSAGES.STUDENT_LOGIN_FAILED,
    });

    await expect(
      service.loginWithGoogleUserProfile({
        googleUserId: 'google-user-1',
        email: 'x@y.com',
        res,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
