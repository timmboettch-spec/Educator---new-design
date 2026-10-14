import * as Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Renders every Report Available email template with strict mode (matching
 * MailService's actual Handlebars.compile options) so a template/context
 * mismatch fails CI instead of silently swallowing production emails —
 * this is exactly the class of bug that caused Report Available emails to
 * stop sending entirely (report-available.hbs referenced {{studentCode}},
 * which the caller never provided; report-digest.hbs didn't exist at all).
 */
function renderTemplate(name: string, context: Record<string, unknown>): string {
    const source = readFileSync(join(__dirname, '../../../src/mail/templates', `${name}.hbs`), 'utf8');
    const tpl = Handlebars.compile(source, { strict: true });
    return tpl(context);
}

describe('Report Available email templates render without a strict-mode context mismatch', () => {
    it('report-available.hbs renders with the exact context notifyEducatorReportAvailable() sends', () => {
        expect(() =>
            renderTemplate('report-available', {
                educatorName: 'Jane Doe',
                studentCode: 'ext-123',
                studentName: 'Alice',
                simulationTitle: 'Stroke Assessment',
                className: 'Nursing 101',
                logoUrl: '',
            }),
        ).not.toThrow();
    });

    it('report-available.hbs renders even when className is omitted (optional field)', () => {
        expect(() =>
            renderTemplate('report-available', {
                educatorName: 'Jane Doe',
                studentCode: 'ext-123',
                studentName: 'Alice',
                simulationTitle: 'Stroke Assessment',
                className: undefined,
                logoUrl: '',
            }),
        ).not.toThrow();
    });

    it('report-digest.hbs renders with the exact context sendDigests() sends, including legacy entries without studentCode', () => {
        expect(() =>
            renderTemplate('report-digest', {
                educatorName: 'Jane Doe',
                frequency: 'weekly',
                logoUrl: '',
                reports: [
                    {
                        studentName: 'Alice',
                        simulationTitle: 'Stroke Assessment',
                        className: 'Nursing 101',
                        scenarioId: 'sim-1',
                    },
                    {
                        studentCode: 'ext-456',
                        studentName: 'Bob',
                        simulationTitle: 'Cardiac Assessment',
                        className: 'Nursing 102',
                        scenarioId: 'sim-2',
                    },
                ],
            }),
        ).not.toThrow();
    });

    it('report-digest.hbs renders with an empty reports array', () => {
        expect(() =>
            renderTemplate('report-digest', {
                educatorName: 'Jane Doe',
                frequency: 'monthly',
                logoUrl: '',
                reports: [],
            }),
        ).not.toThrow();
    });
});
