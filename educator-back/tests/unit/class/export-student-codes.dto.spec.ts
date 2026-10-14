import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExportStudentCodesReqDto } from 'src/class/dto';
import { StudentCodesExportFormat } from 'src/common/constants';

const errorsFor = async (query: Record<string, unknown>): Promise<string[]> => {
  const errors = await validate(plainToInstance(ExportStudentCodesReqDto, query));
  return errors.map((error) => error.property);
};

describe('ExportStudentCodesReqDto', () => {
  it('accepts a missing format (defaults to CSV in the service)', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it.each(Object.values(StudentCodesExportFormat))('accepts format=%s', async (format) => {
    expect(await errorsFor({ format })).toEqual([]);
  });

  it.each(['xml', 'PDF', 'xlsx', ''])('rejects format=%p', async (format) => {
    expect(await errorsFor({ format })).toEqual(['format']);
  });
});
