import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkReviewReportsReqDto } from 'src/simulation-reports/dto/bulk-review-reports.dto';
import { SimulationReportSelectorType } from 'src/common/constants/simulation-report.constants';
import { createValidationPipe } from 'src/common/pipes/validation.pipe';

describe('BulkReviewReportsReqDto', () => {
  const validPayload = {
    type: SimulationReportSelectorType.REPORT,
    ids: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
    reviewed: true,
  };

  it('passes validation for a well-formed payload', async () => {
    const dto = plainToInstance(BulkReviewReportsReqDto, validPayload);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing/invalid selector type', async () => {
    const dto = plainToInstance(BulkReviewReportsReqDto, { ...validPayload, type: 'not-a-type' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejects an empty ids array', async () => {
    const dto = plainToInstance(BulkReviewReportsReqDto, { ...validPayload, ids: [] });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });

  it('rejects a missing ids field', async () => {
    const { ids: _ids, ...rest } = validPayload;
    const dto = plainToInstance(BulkReviewReportsReqDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });

  it('rejects a missing reviewed flag', async () => {
    const { reviewed: _reviewed, ...rest } = validPayload;
    const dto = plainToInstance(BulkReviewReportsReqDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'reviewed')).toBe(true);
  });

  it('rejects a request mixing more than one selector kind (e.g. extra classIds alongside ids)', async () => {
    const pipe = createValidationPipe();
    await expect(
      pipe.transform(
        { ...validPayload, classIds: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] },
        { type: 'body', metatype: BulkReviewReportsReqDto },
      ),
    ).rejects.toThrow();
  });
});
