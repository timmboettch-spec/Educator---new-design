import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Toast, { toast } from '../../components/common/Toast';
import { PageHeader } from '../../components/common/PageHeader';
import { Button } from '../../components/ui/Button';
import {
  classesApi,
  useDeleteClassMutation,
} from '../../redux/api/classes/classesApi';
import { studentsApi } from '../../redux/api/students/studentsApi';
import {
  getApiErrorMessage,
  getSchoolGroupId,
  type ClassListFilters,
} from '../../redux/api/classes/classesService';
import { translateApiError } from '../../utils/translateApiError';
import {
  selectClassResponse,
  selectNeedsAttentionById,
  selectNeedAttentionByClassId,
} from '../../redux/class/GetClassRedux';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import ClassesNeedingAttentionCard from '../../components/class/ClassesNeedingAttentionCard';
import ClassFormModal from '../../components/class/Classformmodal';
import { ClassToolbar } from '../../components/class/ClassToolbar';
import { SchoolAccordionList } from '../../components/class/SchoolAccordionList';
import {
  getMinWidth,
  ListTableHeader,
} from '../../components/common/ListTable';
import { useClassColumns } from '../../components/class/Useclasscolumns';
import {
  type Class,
  type ModalMode,
  type ClassWithStudents,
} from '../../types/Class_types';
import { selectEducatorReports } from '@/redux/reports/EducatorReportsRedux';
import { getParsedUser } from '@/utils/storage';
import { selectLiveRosterByClassName } from '../../redux/lms/SyncLmsClassesRedux';
import { useClassFormSubmit } from '../../hooks/useClassFormSubmit';
import { useClassSync } from '../../hooks/useClassSync';
import { useClassProfileSchoolsSync } from '../../hooks/useClassProfileSchoolsSync';
import { useClassDeepLinkExpansion } from '../../hooks/useClassDeepLinkExpansion';
import { useClassFilters } from '../../hooks/useClassFilters';
import { useClassAttentionMeasure } from '../../hooks/useClassAttentionMeasure';
import { useClassDerivedData } from '../../hooks/useClassDerivedData';
import { useClassSort } from '../../hooks/useClassSort';
import { useLegacyClassLookup } from '../../hooks/useLegacyClassLookup';
import { useFilteredClassCount } from '../../hooks/useFilteredClassCount';
import { useClassResultCount } from '../../hooks/useClassResultCount';
import { useElementHeight } from '../../hooks/useElementHeight';
import { ClassListAnnouncer } from '../../components/class/ClassListAnnouncer';
import { resetClassListQuery } from '../../redux/api/classes/classesSlice';

export default function Classes() {
  const { t, i18n } = useTranslation('classManagement');
  const language = i18n.language === 'es' ? 'es' : 'en';
  const dispatch = useAppDispatch();
  const [deleteClass, { isLoading: isDeletingClass }] =
    useDeleteClassMutation();
  const classResponse = useAppSelector(selectClassResponse) as {
    data?: { classes?: ClassWithStudents[] };
  } | null;
  const needsAttentionByIdMap = useAppSelector(selectNeedsAttentionById);
  const needAttentionByClassId = useAppSelector(selectNeedAttentionByClassId);
  const reports = useAppSelector(selectEducatorReports);
  const liveRosterByClassName = useAppSelector(selectLiveRosterByClassName);

  const user = getParsedUser();
  const educatorSchools: Array<{ id: string; school_name: string }> =
    ((user as Record<string, unknown> | null)?.schools as Array<{
      id: string;
      school_name: string;
    }>) ?? [];

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);

  useClassProfileSchoolsSync();

  const { allClasses, reportsByClassId } = useClassDerivedData({
    classResponse,
    reports,
    needAttentionByClassId,
    needsAttentionByIdMap,
  });

  const classById = useLegacyClassLookup(allClasses);

  const {
    searchTerm,
    setSearchTerm,
    filterOpen,
    setFilterOpen,
    filterValues,
    setFilterValues,
    appliedFilter,
    setAppliedFilter,
    activeFilterChips,
    schoolField,
    classNameField,
    statusField,
    handleRemoveFilter,
    handleClearAllFilters,
  } = useClassFilters();

  const { measure, isMeasureSynced, setMeasure, toggleMeasure } =
    useClassAttentionMeasure();

  // The list query is per visit: leaving the page clears it, as before.
  useEffect(
    () => () => {
      dispatch(resetClassListQuery());
    },
    [dispatch]
  );

  const { sortField, sortDirection, handleSort, sortBy, sortDir } =
    useClassSort();

  // The list query (search is already debounced by the search box) in the
  // shape the school/class list endpoints take.
  const listFilters = useMemo<ClassListFilters>(
    () => ({
      schoolIds: appliedFilter.schools ?? [],
      classIds: appliedFilter.classIds ?? [],
      statuses: appliedFilter.statuses ?? [],
      startDate: appliedFilter.startDate || undefined,
      endDate: appliedFilter.endDate || undefined,
      search: searchTerm,
      measure,
      sortBy,
      sortDir,
    }),
    [appliedFilter, searchTerm, measure, sortBy, sortDir]
  );

  const filteredClassCount = useFilteredClassCount(
    listFilters,
    isMeasureSynced
  );
  const resultCount = useClassResultCount(listFilters, isMeasureSynced);

  // The list scrolls in its own box, under a pinned header whose height the
  // school bars stick below.
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const tableHeaderRef = useRef<HTMLDivElement>(null);
  const tableHeaderHeight = useElementHeight(tableHeaderRef);

  // Opens the create-class modal (shared by the header + bottom buttons).
  const handleAddClass = () => {
    setModalMode('create');
    setSelectedClass(null);
    setIsModalOpen(true);
  };

  const {
    expandedId,
    expandedType,
    toggleExpand,
    locationState,
    targetClassId,
    targetSimulationId,
  } = useClassDeepLinkExpansion({
    allClassesLength: allClasses.length,
    setSearchTerm,
    resetFilters: handleClearAllFilters,
  });

  const { refetchClasses, handleStatusChange } = useClassSync({
    user,
    allClasses,
    language,
  });

  const { handleFormSubmit } = useClassFormSubmit({
    modalMode,
    selectedClass,
    allClasses,
    educatorSchools,
    language,
    onClose: () => setIsModalOpen(false),
    refetchClasses,
  });

  // Student changes go through legacy thunks, so refresh the legacy list, the
  // cached school/class lists (their counts come from the BE) and the rosters.
  const handleStudentAdded = () => {
    void refetchClasses();
    dispatch(classesApi.util.invalidateTags(['Classes']));
    dispatch(studentsApi.util.invalidateTags(['Students']));
  };

  const targetClass = targetClassId ? classById.get(targetClassId) : undefined;
  const targetSchoolId = targetClass
    ? getSchoolGroupId(targetClass.school_id)
    : null;

  const confirmDelete = async () => {
    if (!selectedClass) return;

    try {
      await deleteClass(selectedClass.id).unwrap();
      toast.success(t('toast.deleted'));
      setIsModalOpen(false);
      void refetchClasses();
    } catch (error) {
      const errorMsg = getApiErrorMessage(error, t('toast.deleteError'));
      toast.error(translateApiError(errorMsg, language));
    }
  };

  const classColumns = useClassColumns({
    sortField,
    sortDirection,
    onSort: handleSort,
    expandedId,
    expandedType,
    onToggleExpand: toggleExpand,
  });

  return (
    <div className="px-4 pt-6">
      <Toast />

      <PageHeader
        title={t('page.title')}
        centerContent={
          <ClassesNeedingAttentionCard
            onFilter={toggleMeasure}
            activeMeasure={measure ?? null}
          />
        }
        actionButton={
          <Button
            variant="gradient"
            className="h-10 px-5 flex items-center gap-2 rounded-full shadow-md mr-4"
            onClick={(e) => {
              e.stopPropagation();
              handleAddClass();
            }}
          >
            <Plus className="text-white stroke-[4]" />
            {t('page.addClass')}
          </Button>
        }
      />

      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden mt-4 mx-2 sm:mx-4">
        <ClassToolbar
          searchTerm={searchTerm}
          onSearch={setSearchTerm}
          filterOpen={filterOpen}
          onFilterToggle={() => setFilterOpen((o) => !o)}
          activeFilterChips={activeFilterChips}
          onRemoveFilter={handleRemoveFilter}
          onClearAllFilters={handleClearAllFilters}
          filterValues={filterValues}
          setFilterValues={setFilterValues}
          appliedFilter={appliedFilter}
          setAppliedFilter={setAppliedFilter}
          setFilterOpen={setFilterOpen}
          schoolField={schoolField}
          classNameField={classNameField}
          statusField={statusField}
          attentionFilter={
            measure ? { measure, count: filteredClassCount } : null
          }
          onClearAttentionFilter={() => setMeasure(null)}
        />
        <ClassListAnnouncer
          resultCount={resultCount}
          sortField={sortField}
          sortDirection={sortDirection}
        />
        {/* Header + school accordions share one scroll area so the header stays pinned. */}
        <div ref={scrollAreaRef} className="max-h-[70vh] overflow-auto">
          {/* The table's own min width, not `min-w-max`: sub-tables with % columns
              report a huge intrinsic width and would stretch every column. */}
          <div style={{ minWidth: getMinWidth(classColumns) }}>
            <div ref={tableHeaderRef} className="sticky top-0 z-20">
              <ListTableHeader
                columns={classColumns}
                actionHeader={t('table.headers.actions')}
              />
            </div>
            <SchoolAccordionList
              filters={listFilters}
              classById={classById}
              autoOpenSchoolId={targetSchoolId}
              paused={!isMeasureSynced}
              scrollRootRef={scrollAreaRef}
              stickyBarTop={tableHeaderHeight}
              onClearSearch={() => setSearchTerm('')}
              onClearFilters={() => {
                handleClearAllFilters();
                setMeasure(null);
              }}
              tableProps={{
                columns: classColumns,
                actionHeader: t('table.headers.actions'),
                targetClassId,
                targetSimulationId,
                expandedId,
                expandedType,
                liveRosterByClassName,
                reportsByClassId,
                onStudentAdded: handleStudentAdded,
                openMenuId,
                openStatusId,
                onMenuToggle: setOpenMenuId,
                onStatusToggle: setOpenStatusId,
                onEdit: (r) => {
                  setSelectedClass(r);
                  setModalMode('edit');
                  setIsModalOpen(true);
                },
                onDelete: (r) => {
                  setSelectedClass(r);
                  setModalMode('delete');
                  setIsModalOpen(true);
                },
                onStatusChange: handleStatusChange,
                locationState,
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-center mt-6 mb-2">
        <Button
          variant="gradient"
          className="h-10 px-5 flex items-center gap-2 rounded-full shadow-md"
          onClick={(e) => {
            e.stopPropagation();
            handleAddClass();
          }}
        >
          <Plus className="text-white stroke-[4]" />
          {t('page.addClass')}
        </Button>
      </div>

      <ClassFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        modalMode={modalMode}
        selectedClass={selectedClass}
        isDeleting={isDeletingClass}
        onConfirmDelete={confirmDelete}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
