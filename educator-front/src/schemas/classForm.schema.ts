import type { TFunction } from 'i18next';
import * as Yup from 'yup';
import type { ModalMode } from '../types/Class_types';
import {
  CLASS_NAME_MAX_LENGTH,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasUnsafeMarkupOrScriptPattern,
  normalizePlainTextInput,
} from '../utils/inputSecurity';
import {
  ISO_DATE_REGEX,
  isTodayOrFutureDate,
} from '../utils/schema-utils/dateRules';

interface ClassFormSchemaOptions {
  t: TFunction<'classManagement'>;
  modalMode: ModalMode;
  hasSchools: boolean;
}

/**
 * Validation schema for the create/edit class modal. Built per render because
 * the rules depend on the modal mode and the educator's schools.
 */
export const getClassFormSchema = ({
  t,
  modalMode,
  hasSchools,
}: ClassFormSchemaOptions) =>
  Yup.object({
    school_id: Yup.string().when([], {
      is: () => modalMode === 'create' && hasSchools,
      then: (s) => s.required(t('form.errors.schoolRequired')),
      otherwise: (s) => s.optional(),
    }),
    class_name: Yup.string()
      .transform((value) =>
        normalizePlainTextInput(value ?? '', CLASS_NAME_MAX_LENGTH)
      )
      .required(t('form.errors.classNameRequired'))
      .min(3, t('form.errors.classNameMin'))
      .max(CLASS_NAME_MAX_LENGTH, t('form.errors.classNameMax'))
      .test(
        'safe-class-name-pattern',
        t('form.errors.classNameUnsafeMarkup'),
        (value) => !value || !hasUnsafeMarkupOrScriptPattern(value)
      )
      .test(
        'allowed-class-name-characters',
        t('form.errors.classNameDisallowedChars'),
        (value) => !value || !hasDisallowedClassNameChars(value)
      )
      .test(
        'sql-injection-pattern',
        t('form.errors.classNameSqlLike'),
        (value) => !value || !hasSqlInjectionLikePattern(value)
      )
      .test(
        'blocked-coding-keyword',
        t('form.errors.classNameCodingKeyword'),
        (value) => !value || !hasBlockedCodingKeyword(value)
      )
      .test(
        'code-like-syntax',
        t('form.errors.classNameCodeSyntax'),
        (value) => !value || !hasCodeLikeSyntaxPattern(value)
      ),
    start_date: Yup.string()
      .matches(ISO_DATE_REGEX, t('form.errors.dateFormat'))
      .required(t('form.errors.startDateRequired'))
      .test('no-past-start', t('form.errors.startPast'), (value) => {
        if (!value || modalMode === 'edit') return true;
        return isTodayOrFutureDate(value);
      }),
    end_date: Yup.string()
      .matches(ISO_DATE_REGEX, t('form.errors.dateFormat'))
      .required(t('form.errors.endDateRequired'))
      .test('no-past-end', t('form.errors.endPast'), (value) => {
        if (!value || modalMode === 'edit') return true;
        return isTodayOrFutureDate(value);
      })
      .test(
        'end-after-start',
        t('form.errors.endAfterStart'),
        function (value) {
          const { start_date } = this.parent;
          if (!start_date || !value) return true;
          return new Date(value) > new Date(start_date);
        }
      ),
    // Optional: leaving it blank creates the class without student codes.
    total_no_of_students: Yup.string().matches(
      /^\d*$/,
      t('form.errors.studentCountNumeric')
    ),
  });
