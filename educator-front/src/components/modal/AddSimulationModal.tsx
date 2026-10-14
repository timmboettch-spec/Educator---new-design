import { AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { useFormik } from 'formik';
import { useTranslation } from 'react-i18next';
import { toast } from '../common/Toast';
import { InlineCreateClassCard } from '../class/InlineCreateClassCard';
import { SimulationDetailsPanel } from '../simulation/SimulationDetailsPanel';
import FormField from '../ui/FormField';
import { DatePickerField } from '../ui/DatePickerField';
import { MultiSelect, type MultiSelectOption } from '../ui/MultiSelect';
import SelectField from '../ui/Select';
import { ConfirmDialog } from './ConfirmDialog';
import { FormModal } from './FormModal';
import { useAssignClassOptions } from '../../hooks/useAssignClassOptions';
import { useAssignSimulationsData } from '../../hooks/useAssignSimulationsData';
import { useSimulationValueLabel } from '../../hooks/useSimulationValueLabel';
import { useDateRangeFields } from '../../hooks/useDateRangeFields';
import {
  UNASSIGNED_SCHOOL,
  type ClassResDto,
} from '../../redux/api/classes/classes.types';
import { useBulkAssignClassSimulationsMutation } from '../../redux/api/classSimulations/classSimulationsApi';
import {
  BULK_ASSIGN_MAX_CLASSES,
  BULK_ASSIGN_MAX_SIMULATIONS,
} from '../../redux/api/classSimulations/classSimulations.types';
import {
  buildBulkAssignBody,
  getApiErrorMessage,
} from '../../redux/api/classSimulations/classSimulationsService';
import { FetchClassesRequest } from '../../redux/class/GetClassRedux';
import {
  fetchMyLibrarySimulations,
  type Simulation,
} from '../../redux/dashboard/simulationlibrary/GetSimulationRedux';
import { fetchNotifications } from '../../redux/notifications/NotificationsRedux';
import {
  getAssignSimulationsSchema,
  type AssignSimulationsFormValues,
} from '../../schemas/assignSimulations.schema';
import { useAppDispatch } from '../../store/hooks';
import type { SimulationItem } from '../../types';
import type {
  AssignableClass,
  AssignContextClass,
} from '../../types/simulationAssignment.types';
import {
  buildSimulationOptions,
  EMPTY_SIMULATION_FILTERS,
  findAssignmentConflict,
  getSeatShortfall,
  isLearnerLevel,
  isSimulationModality,
  toAssignableStartDate,
  type SimulationFilterValues,
} from '../../utils/assignSimulationOptions';
import { LEARNER_LEVELS, MODALITIES } from '../../utils/libraryFilters';
import { getAiSeats } from '../../utils/normalizeAuthUser';
import { formatSimDate, toIsoSimDate } from '../../utils/simAssignment';
import { getParsedUser } from '../../utils/storage';

interface AddSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssigned?: () => void | Promise<void>;
  /** Pre-selects one simulation (library card / row). */
  simulationId?: string;
  /** Pre-selects several simulations (bulk assign from the library). */
  simulationIds?: string[];
  /** Opened from a class: its school and the class are pre-selected (still editable). */
  classContext?: AssignContextClass;
  /** The class's current assignments (class context), for the already-assigned check. */
  simulations: Simulation[] | SimulationItem[];
}

const DATE_FIELD_NAMES = ['startDate', 'dueDate', 'endDate'] as const;
const DATE_LABEL_CLASS = 'text-sm text-gray-700';

interface NewClassDraft {
  name: string;
  startDate: string;
  endDate: string;
}

const EMPTY_VALUES: AssignSimulationsFormValues = {
  schoolId: '',
  classIds: [],
  simulationIds: [],
  startDate: '',
  dueDate: '',
  endDate: '',
};

const NOTIFICATIONS_REFRESH_DELAY_MS = 800;

/**
 * Assigns several simulations to several classes in one request, with one set
 * of dates. A class can be created inline from the Class Name search.
 */
export const AddSimulationModal = ({
  isOpen,
  onClose,
  onAssigned,
  simulationId,
  simulationIds,
  classContext,
  simulations: classAssignments = [],
}: AddSimulationModalProps) => {
  const { t } = useTranslation('simulationAssignment');
  const dispatch = useAppDispatch();
  const [bulkAssign, { isLoading: isAssigning }] =
    useBulkAssignClassSimulationsMutation();
  const { simulations, isSimulationsLoading, hasSimulationsError } =
    useAssignSimulationsData(isOpen);

  const [simFilters, setSimFilters] = useState<SimulationFilterValues>(
    EMPTY_SIMULATION_FILTERS
  );
  const valueLabel = useSimulationValueLabel();
  const [simSearch, setSimSearch] = useState('');
  // The chosen school's name, for the trigger and the inline class card.
  const [schoolLabel, setSchoolLabel] = useState('');
  // Classes known without loading the list: the context class and new classes.
  const [extraClasses, setExtraClasses] = useState<
    Record<string, AssignableClass>
  >({});
  const [newClass, setNewClass] = useState<NewClassDraft | null>(null);
  const [pendingValues, setPendingValues] =
    useState<AssignSimulationsFormValues | null>(null);
  // The simulations are pre-selected once per open, when the library arrives.
  const hasSeededSimsRef = useRef(false);
  // Likewise the only school, once the school list arrives.
  const hasSeededSchoolRef = useRef(false);

  const today = dayjs();
  const todayIso = today.format('YYYY-MM-DD');
  const storedUser = getParsedUser();

  const assign = async (values: AssignSimulationsFormValues) => {
    let created: number;
    try {
      ({ created } = await bulkAssign(buildBulkAssignBody(values)).unwrap());
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('toast.error')));
      return;
    }
    toast.success(t('toast.success', { count: created }));
    try {
      await onAssigned?.();
    } catch {
      // The assignments were created; a failing refresh must not hide that.
    }
    handleClose();
    void dispatch(fetchMyLibrarySimulations({ skipImages: true }));
    void dispatch(FetchClassesRequest({ silent: true }));
    setTimeout(() => {
      void dispatch(fetchNotifications());
    }, NOTIFICATIONS_REFRESH_DELAY_MS);
  };

  const formik = useFormik<AssignSimulationsFormValues>({
    initialValues: EMPTY_VALUES,
    validationSchema: getAssignSimulationsSchema(t),
    onSubmit: async (values) => {
      // The already-assigned check only knows the class it was opened from.
      if (classContext && values.classIds.includes(classContext.id)) {
        const conflict = findAssignmentConflict(
          classAssignments,
          values.simulationIds,
          today
        );
        if (conflict === 'active') {
          toast.error(t('warningActive'));
          return;
        }
        if (conflict === 'previous') {
          setPendingValues(values);
          return;
        }
      }
      await assign(values);
    },
  });

  const { values } = formik;
  const { dateFieldProps } = useDateRangeFields(formik, DATE_FIELD_NAMES);
  // From a class the school is already known; otherwise the schools load
  // straight away so an educator with only one gets it pre-selected.
  const { schoolField, classField, onlySchool, classesById, resetSearches } =
    useAssignClassOptions(values.schoolId, {
      preloadSchools: isOpen && !classContext,
    });
  const knownClasses = { ...classesById, ...extraClasses };

  // Opened from a class: that class, its school and dates. Otherwise empty;
  // the only school is filled in when the school list arrives.
  const getInitialSelection = () => {
    if (classContext) {
      return {
        values: {
          ...EMPTY_VALUES,
          schoolId: classContext.schoolId,
          classIds: [classContext.id],
          startDate: toAssignableStartDate(classContext.startDate, today),
          endDate: toIsoSimDate(classContext.endDate),
        },
        schoolLabel: classContext.schoolName,
        extraClasses: { [classContext.id]: classContext },
      };
    }
    return { values: EMPTY_VALUES, schoolLabel: '', extraClasses: {} };
  };

  const resetModal = () => {
    const initial = getInitialSelection();
    formik.resetForm({ values: initial.values });
    setSchoolLabel(initial.schoolLabel);
    setExtraClasses(initial.extraClasses);
    setSimFilters(EMPTY_SIMULATION_FILTERS);
    resetSearches();
    setSimSearch('');
    setNewClass(null);
    setPendingValues(null);
    hasSeededSimsRef.current = false;
    hasSeededSchoolRef.current = false;
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  useEffect(() => {
    if (isOpen) resetModal();
  }, [isOpen]);

  // Library context: pre-select the simulation(s) the modal was opened for.
  useEffect(() => {
    if (!isOpen || hasSeededSimsRef.current || simulations.length === 0) {
      return;
    }
    hasSeededSimsRef.current = true;
    const wanted = simulationIds?.length
      ? simulationIds
      : simulationId
        ? [simulationId]
        : [];
    const ids = wanted.filter((id) => simulations.some((s) => s.id === id));
    if (ids.length > 0) void formik.setFieldValue('simulationIds', ids);
  }, [isOpen, simulations]);

  // Library context: pre-select the school when the educator has only one,
  // unless they already picked one.
  useEffect(() => {
    if (!isOpen || classContext || hasSeededSchoolRef.current || !onlySchool) {
      return;
    }
    hasSeededSchoolRef.current = true;
    if (formik.values.schoolId) return;
    setSchoolLabel(onlySchool.label);
    void formik.setFieldValue('schoolId', onlySchool.value);
  }, [isOpen, onlySchool]);

  if (!isOpen) return null;

  const simulationOptions = buildSimulationOptions(simulations, simFilters);
  const matches = (options: MultiSelectOption[], search: string) =>
    options.filter((o) =>
      o.label.toLowerCase().includes(search.trim().toLowerCase())
    );
  const toSelected = (options: MultiSelectOption[], ids: string[]) =>
    ids.flatMap((id) => options.filter((o) => o.value === id));
  const allSimulationOptions = buildSimulationOptions(simulations);

  const selectedSimulations = values.simulationIds.flatMap((id) =>
    simulations.filter((sim) => sim.id === id)
  );

  const seatShortfall = getSeatShortfall(
    selectedSimulations,
    values.classIds.map((id) => knownClasses[id]?.studentsCount ?? 0),
    storedUser?.['ai_seats'] ? getAiSeats(storedUser) : null
  );
  const seatWarning =
    seatShortfall?.kind === 'noProduct'
      ? t('seats.noProduct')
      : seatShortfall?.kind === 'insufficient'
        ? t('seats.insufficient', {
            remaining: seatShortfall.remaining,
            needed: seatShortfall.needed,
          })
        : null;

  const errorFor = (name: keyof AssignSimulationsFormValues) => {
    const error = formik.errors[name];
    return (formik.touched[name] || formik.submitCount > 0) &&
      typeof error === 'string'
      ? error
      : undefined;
  };

  // A different school's classes no longer apply.
  const handleSchoolChange = (selected: MultiSelectOption[]) => {
    const school = selected[0];
    setSchoolLabel(school?.label ?? '');
    void formik.setFieldTouched('schoolId', true, false);
    void formik.setValues({
      ...values,
      schoolId: school?.value ?? '',
      classIds: [],
    });
    setNewClass(null);
  };

  // The dates default from the first selected class (applied to every class),
  // only when that first class changes, so dates the educator edited survive
  // adding or removing other classes.
  const datesFromFirstClass = (classIds: string[]) => {
    if (classIds[0] === values.classIds[0]) return {};
    const first = classIds[0] ? knownClasses[classIds[0]] : undefined;
    return first
      ? {
          startDate: toAssignableStartDate(first.startDate, today),
          endDate: toIsoSimDate(first.endDate),
          dueDate: '',
        }
      : {};
  };

  const handleClassesChange = (selected: MultiSelectOption[]) => {
    const classIds = selected.map((o) => o.value);
    void formik.setFieldTouched('classIds', true, false);
    void formik.setValues({
      ...values,
      classIds,
      ...datesFromFirstClass(classIds),
    });
  };

  const handleClassCreated = (created: ClassResDto) => {
    // The class list refetches by itself (the create invalidates it); the
    // legacy full list backs the class page's sub-tables.
    void dispatch(FetchClassesRequest({ silent: true }));
    setExtraClasses((prev) => ({
      ...prev,
      [created.classId]: {
        id: created.classId,
        name: created.className,
        startDate: created.startDate,
        endDate: created.endDate,
        studentsCount: created.totalNoOfStudents ?? 0,
      },
    }));
    const classIds = values.classIds.includes(created.classId)
      ? values.classIds
      : [...values.classIds, created.classId];
    // Like a picked class, it sets the dates only if it is the first class.
    const isNewFirstClass =
      classIds[0] === created.classId && values.classIds[0] !== created.classId;
    void formik.setValues({
      ...values,
      classIds,
      ...(isNewFirstClass && {
        startDate: toAssignableStartDate(created.startDate, today),
        endDate: toIsoSimDate(created.endDate),
        dueDate: '',
      }),
    });
    setNewClass(null);
    classField.onSearchChange('');
    toast.success(t('inlineClass.created'));
  };

  // A different filter can hide the picked simulations, so they're cleared.
  const handleFilterChange = (next: Partial<SimulationFilterValues>) => {
    setSimFilters((prev) => ({ ...prev, ...next }));
    void formik.setFieldValue('simulationIds', []);
  };

  const selectedSchool = values.schoolId
    ? [{ value: values.schoolId, label: schoolLabel || values.schoolId }]
    : [];
  // Selected classes keep their names while the list is searched or reloaded.
  const selectedClasses = values.classIds.map((id) => {
    const cls = knownClasses[id];
    return {
      value: id,
      label: cls?.name ?? id,
      description: cls
        ? `${formatSimDate(cls.startDate)} – ${formatSimDate(cls.endDate)}`
        : undefined,
    };
  });
  const detailsSim =
    selectedSimulations.length === 1 ? selectedSimulations[0] : undefined;

  return (
    <>
      <FormModal
        isOpen={isOpen}
        onClose={handleClose}
        title={t('title')}
        formId="assign-simulations-form"
        onSubmit={formik.handleSubmit}
        submitText={t('createAssignment')}
        submittingText={t('adding')}
        cancelText={t('back')}
        isSubmitting={formik.isSubmitting || isAssigning}
        isSubmitDisabled={!!seatWarning || !!newClass}
        className="max-w-3xl w-full"
      >
        {seatWarning && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            <AlertCircle
              size={18}
              aria-hidden="true"
              className="shrink-0 mt-0.5"
            />
            <span>{seatWarning}</span>
          </div>
        )}

        <FormField
          label={t('fieldSchool')}
          required
          error={errorFor('schoolId')}
        >
          <MultiSelect
            label={t('fieldSchool')}
            selectionMode="single"
            placeholder={t('placeholderSchool')}
            summaryNoun={() => t('selectedNoun')}
            options={schoolField.options}
            selected={selectedSchool}
            onChange={handleSchoolChange}
            searchValue={schoolField.searchValue}
            onSearchChange={schoolField.onSearchChange}
            onOpen={schoolField.onOpen}
            onLoadMore={schoolField.onLoadMore}
            hasMore={schoolField.hasMore}
            isFetchingMore={schoolField.isFetchingMore}
            loading={schoolField.loading}
            error={schoolField.isError ? t('schoolsLoadFailed') : undefined}
          />
        </FormField>

        <FormField
          label={t('fieldClassName')}
          required
          error={errorFor('classIds')}
        >
          <MultiSelect
            label={t('fieldClassName')}
            placeholder={
              !values.schoolId
                ? t('placeholderSelectSchoolFirst')
                : t('placeholderSelectClass')
            }
            summaryNoun={() => t('selectedNoun')}
            options={classField.options}
            selected={selectedClasses}
            onChange={handleClassesChange}
            searchValue={classField.searchValue}
            onSearchChange={classField.onSearchChange}
            onOpen={classField.onOpen}
            onLoadMore={classField.onLoadMore}
            hasMore={classField.hasMore}
            isFetchingMore={classField.isFetchingMore}
            loading={classField.loading}
            error={classField.isError ? t('classesLoadFailed') : undefined}
            maxSelected={BULK_ASSIGN_MAX_CLASSES}
            disabled={!values.schoolId}
            // Offered only once the list shows the results for what's typed,
            // so an existing class can't be missed and created twice.
            onCreate={
              classField.isSearchPending
                ? undefined
                : (name) =>
                    setNewClass({
                      name,
                      startDate: values.startDate,
                      endDate: values.endDate,
                    })
            }
            createLabel={(name) => t('createClassOption', { name })}
          />
        </FormField>

        {newClass && (
          <InlineCreateClassCard
            schoolLabel={schoolLabel || '—'}
            schoolId={
              values.schoolId === UNASSIGNED_SCHOOL
                ? undefined
                : values.schoolId
            }
            initialName={newClass.name}
            initialStartDate={newClass.startDate}
            initialEndDate={newClass.endDate}
            existingClassNames={Object.values(knownClasses).map(
              (cls) => cls.name
            )}
            onCreated={handleClassCreated}
            onCancel={() => setNewClass(null)}
          />
        )}

        <SelectField
          label={t('fieldModality')}
          options={MODALITIES.map((value) => ({
            value,
            label: valueLabel(value),
          }))}
          value={simFilters.modality}
          placeholder={t('placeholderModality')}
          onChange={(value) =>
            handleFilterChange({
              modality: isSimulationModality(value) ? value : '',
            })
          }
        />

        <SelectField
          label={t('fieldLearnerLevel')}
          options={LEARNER_LEVELS.map((value) => ({
            value,
            label: valueLabel(value),
          }))}
          value={simFilters.learnerLevel}
          placeholder={t('placeholderLearnerLevel')}
          onChange={(value) =>
            handleFilterChange({
              learnerLevel: isLearnerLevel(value) ? value : '',
            })
          }
        />

        <FormField
          label={t('fieldSimName')}
          required
          error={errorFor('simulationIds')}
        >
          <MultiSelect
            label={t('fieldSimName')}
            placeholder={
              isSimulationsLoading
                ? t('placeholderLoadingSims')
                : t('placeholderSelectSim')
            }
            summaryNoun={() => t('selectedNoun')}
            options={matches(simulationOptions, simSearch)}
            selected={toSelected(allSimulationOptions, values.simulationIds)}
            onChange={(selected) => {
              void formik.setFieldTouched('simulationIds', true, false);
              void formik.setFieldValue(
                'simulationIds',
                selected.map((o) => o.value)
              );
            }}
            searchValue={simSearch}
            onSearchChange={setSimSearch}
            loading={isSimulationsLoading}
            error={hasSimulationsError ? t('simulationsLoadFailed') : undefined}
            maxSelected={BULK_ASSIGN_MAX_SIMULATIONS}
          />
        </FormField>

        <fieldset>
          <legend className="block text-sm font-medium text-slate-700 mb-1.5">
            {t('fieldDuration')}
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <DatePickerField
              {...dateFieldProps('startDate')}
              label={t('fieldStartDate')}
              min={todayIso}
              max={values.endDate}
              labelClassName={DATE_LABEL_CLASS}
            />
            <DatePickerField
              {...dateFieldProps('dueDate')}
              label={t('fieldDueDate')}
              min={values.startDate || todayIso}
              max={values.endDate}
              labelClassName={DATE_LABEL_CLASS}
            />
            <DatePickerField
              {...dateFieldProps('endDate')}
              label={t('fieldEndDate')}
              min={values.dueDate || values.startDate || todayIso}
              labelClassName={DATE_LABEL_CLASS}
            />
          </div>
        </fieldset>

        {/* Details only make sense for a single selected simulation. */}
        {detailsSim && <SimulationDetailsPanel sim={detailsSim} />}
      </FormModal>

      <ConfirmDialog
        isOpen={!!pendingValues}
        onClose={() => setPendingValues(null)}
        onConfirm={async () => {
          if (!pendingValues) return;
          await assign(pendingValues);
          setPendingValues(null);
        }}
        title={t('confirmTitle')}
        message={t('confirmMessage')}
        confirmText={t('confirm')}
        cancelText={t('cancel')}
        isLoading={isAssigning}
        loadingText={t('adding')}
      />
    </>
  );
};
