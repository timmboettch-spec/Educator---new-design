import { LtiSubmissionReviewService } from '../../../src/lti/services/lti-submission-review.service';
import { LmsType } from 'src/common/enums/lms.enum';
import { LmsSchoolConfig } from 'src/database/entities';

describe('LtiSubmissionReviewService.resolveReviewLaunch', () => {
  let service: LtiSubmissionReviewService;
  let classMappingRepo: { findOne: jest.Mock };
  let assignmentMappingRepo: { findOne: jest.Mock; find: jest.Mock };
  let studentMappingRepo: { findOne: jest.Mock };
  let gradeSyncLogRepo: { findLatestSentForMappingAndLmsUser: jest.Mock };
  let classesService: { canEducatorAccessClass: jest.Mock };
  let simulationReportRepo: {
    findLatestReportIdByStudentCodeAndScenario: jest.Mock;
    isReportOfStudentCodeAndScenario: jest.Mock;
  };

  const lmsConfig = {
    schoolId: 'school-1',
    lmsType: LmsType.MOODLE,
  } as LmsSchoolConfig;

  const basePayload: Record<string, unknown> = {
    'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiSubmissionReviewRequest',
    'https://purl.imsglobal.org/spec/lti/claim/for_user': { user_id: 'lms-student-1' },
    'https://purl.imsglobal.org/spec/lti/claim/context': { id: 'course-1', title: 'Bio' },
    'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
      lineitem: 'https://moodle.test/mod/lti/services.php/3/lineitems/9/lineitem',
    },
    'https://purl.imsglobal.org/spec/lti/claim/resource_link': { id: 'rl-1' },
  };

  beforeEach(() => {
    classMappingRepo = { findOne: jest.fn() };
    assignmentMappingRepo = { findOne: jest.fn(), find: jest.fn() };
    studentMappingRepo = { findOne: jest.fn() };
    gradeSyncLogRepo = { findLatestSentForMappingAndLmsUser: jest.fn() };
    classesService = { canEducatorAccessClass: jest.fn() };
    simulationReportRepo = {
      findLatestReportIdByStudentCodeAndScenario: jest.fn(),
      isReportOfStudentCodeAndScenario: jest.fn(),
    };

    service = new LtiSubmissionReviewService(
      classMappingRepo as never,
      assignmentMappingRepo as never,
      studentMappingRepo as never,
      gradeSyncLogRepo as never,
      classesService as never,
      simulationReportRepo as never,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never,
    );
  });

  it('returns educators_only path via missing school when educator schools do not match', async () => {
    const result = await service.resolveReviewLaunch({
      payload: basePayload,
      lmsConfig,
      educatorId: 'edu-1',
      educatorSchoolIds: ['other-school'],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('school_mismatch');
    }
  });

  it('rejects when educator is not class owner/co-educator', async () => {
    classMappingRepo.findOne.mockResolvedValue({ classId: 'class-1', schoolId: 'school-1' });
    classesService.canEducatorAccessClass.mockResolvedValue(false);

    const result = await service.resolveReviewLaunch({
      payload: basePayload,
      lmsConfig,
      educatorId: 'edu-1',
      educatorSchoolIds: ['school-1'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('educator_unauthorized');
    }
  });

  it('resolves report when mappings and the stored report match', async () => {
    classMappingRepo.findOne.mockResolvedValue({ classId: 'class-1', schoolId: 'school-1' });
    classesService.canEducatorAccessClass.mockResolvedValue(true);
    assignmentMappingRepo.findOne.mockResolvedValue({
      id: 'map-1',
      classId: 'class-1',
      simulationId: 'sim-99',
      lmsLineItemUrl: 'https://moodle.test/mod/lti/services.php/3/lineitems/9/lineitem',
    });
    studentMappingRepo.findOne.mockResolvedValue({
      studentCode: 'ABC-12',
      classId: 'class-1',
      lmsUserId: 'lms-student-1',
    });
    gradeSyncLogRepo.findLatestSentForMappingAndLmsUser.mockResolvedValue(null);
    simulationReportRepo.findLatestReportIdByStudentCodeAndScenario.mockResolvedValue('report-1');

    const result = await service.resolveReviewLaunch({
      payload: basePayload,
      lmsConfig,
      educatorId: 'edu-1',
      educatorSchoolIds: ['school-1'],
    });

    expect(result).toEqual({
      ok: true,
      schoolId: 'school-1',
      classId: 'class-1',
      simulationId: 'sim-99',
      studentCode: 'ABC-12',
      reportId: 'report-1',
      mappingId: 'map-1',
    });
  });

  it('returns report_not_available when student has no matching report', async () => {
    classMappingRepo.findOne.mockResolvedValue({ classId: 'class-1', schoolId: 'school-1' });
    classesService.canEducatorAccessClass.mockResolvedValue(true);
    assignmentMappingRepo.findOne.mockResolvedValue({
      id: 'map-1',
      simulationId: 'sim-99',
      lmsLineItemUrl: 'https://moodle.test/mod/lti/services.php/3/lineitems/9/lineitem',
    });
    studentMappingRepo.findOne.mockResolvedValue({
      studentCode: 'ABC-12',
      lmsUserId: 'lms-student-1',
    });
    gradeSyncLogRepo.findLatestSentForMappingAndLmsUser.mockResolvedValue(null);
    simulationReportRepo.findLatestReportIdByStudentCodeAndScenario.mockResolvedValue(null);

    const result = await service.resolveReviewLaunch({
      payload: basePayload,
      lmsConfig,
      educatorId: 'edu-1',
      educatorSchoolIds: ['school-1'],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('report_not_available');
    }
  });
});
