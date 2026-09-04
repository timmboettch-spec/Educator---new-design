import { AlertTriangle, Filter, Plus } from "lucide-react";
import dayjs from "dayjs";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Toast, { toast } from "../../components/common/Toast";
import PrintAccessCodeModal from "../../components/class/PrintAccessCode";
import { type ClassTabKey } from "../../components/class/StatusTabs";
import ListTable from "../../components/common/ListTable";
import { PageHeader } from "../../components/common/PageHeader";
import { SearchBar } from "../../components/common/SearchBar";
import { Button } from "../../components/ui/Button";
import {
  DeleteClassRequest,
  selectDeleteStatus,
} from "../../redux/class/DeleteClassRedux";
import {
  FetchClassesRequest,
  selectClassResponse,
  selectAllStudentCodes,
  selectNeedsAttentionById,
  selectNeedAttentionByClassId,
  selectClasses,
  selectClassStatus,
  patchClassInStore,
} from "../../redux/class/GetClassRedux";
import { UpdateClassRequest } from "../../redux/class/PatchClassRedux";
import {
  type PostClassPayload,
  PostClassRequest,
} from "../../redux/class/PostClassRedux";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  finishLmsLaunchSession,
  resyncLmsRostersIfConfigured,
  runLtiLaunchSyncIfNeeded,
} from "../../utils/lmsLaunchSync";
import type { Student } from "../../types";
import { CLASS_TOAST } from "../../utils/messages/class";
import {
  computeClassStatus,
  getActiveStudentCount,
  getEffectiveClassStatus,
} from "../../utils/classUtils";
import ProgressCard from "../../components/ui/ProgressCard";
import ClassFormModal from "../../components/class/Classformmodal";
import ClassRowActions from "../../components/class/Classrowactions";
import SimSubTable from "../../components/class/Simsubtable";
import StudentSubTable from "../../components/class/student/Studentsubtable";
import ReportSubTable from "../../components/class/ReportSubTable";
import { useClassColumns } from "../../components/class/Useclasscolumns";
import {
  type Class,
  type FilterState,
  type ModalMode,
  type ClassFormValues,
  type ClassWithStudents,
} from "../../types/Class_types";
import { parseFileToStudentArray } from "../../types/Fileparser";
import {
  generateUniqueStudentCodes,
  isValidAccessCode,
} from "../../utils/studentCodeGenerator";
import FilterPanel from "@/components/common/FilterPanel";
import { FilterChips } from "../../components/simulationcatalog/FilterChips";
import {
  GetEducatorSimulationReports,
  selectEducatorReports,
} from "@/redux/reports/EducatorReportsRedux";
import { getParsedUser, updateStoredUser } from "@/utils/storage";
import api from "../../redux/api";
import config from "../../redux/config";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import { setLoading } from "@/redux/loader/loaderSlice";
import {
  selectLiveRosterByClassName,
  type LmsStudent,
} from "../../redux/lms/SyncLmsClassesRedux";

function toSafeNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

type LocationState = {
  classId?: string;
  expandType?: "students" | "sims" | "reports";
  simulationId?: string;
  openReportsModal?: boolean;
  openStudentReports?: boolean;
  studentId?: string;
  pinStudentId?: string;
  openSimReports?: boolean;
  simId?: string;
  /** Dashboard-tile deep-link: restrict the list to these class ids + a label. */
  filterClassIds?: string[];
  filterLabel?: string;
};

type ClassResponse = {
  data?: {
    classes?: ClassWithStudents[];
  };
};

type SupportedLang = "en" | "es";

const LANGUAGE_STORAGE_KEY = "app_language";

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === "undefined") {
    return "en";
  }
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === "es" ? "es" : "en";
};

const formatStatusLabel = (status: string) => {
  if (status.toUpperCase() === "ARCHIEVED") return "Archived";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};

export default function Classes() {
  const dispatch = useAppDispatch();
  const deleteStatus = useAppSelector(selectDeleteStatus);
  const classResponse = useAppSelector(
    selectClassResponse,
  ) as ClassResponse | null;
  const existingStudentCodes = useAppSelector(selectAllStudentCodes);
  const needsAttentionByIdMap = useAppSelector(selectNeedsAttentionById);
  const needAttentionByClassId = useAppSelector(selectNeedAttentionByClassId);
  const reports = useAppSelector(selectEducatorReports);
  const classes = useAppSelector(selectClasses) ?? [];
  const liveRosterByClassName = useAppSelector(selectLiveRosterByClassName);
  const classStatus = useAppSelector(selectClassStatus);
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as LocationState | null;
  const language = getStoredLanguage();
  const locale = language === "es" ? loginEs : loginEn;
  const classLocale = locale.classes;
  const targetClassId = locationState?.classId ?? null;
  const targetSimulationId = locationState?.simulationId ?? null;

  useEffect(() => {
    const hasFlag =
      locationState?.openReportsModal ||
      locationState?.openStudentReports ||
      locationState?.openSimReports ||
      locationState?.filterClassIds != null;
    if (hasFlag) {
      navigate(".", {
        replace: true,
        state: {
          ...locationState,
          openReportsModal: undefined,
          openStudentReports: undefined,
          openSimReports: undefined,
          filterClassIds: undefined,
          filterLabel: undefined,
        },
      });
    }
  }, []);
  const [activeTab, setActiveTab] = useState<ClassTabKey>("all");
  // Dashboard-tile deep-link: restrict the list to a specific set of class ids
  // (e.g. "classes closing soon"), with a clearable "Showing:" chip.
  const [idFilter, setIdFilter] = useState<{ ids: string[]; label: string } | null>(
    locationState?.filterClassIds != null
      ? {
          ids: locationState.filterClassIds,
          label: locationState.filterLabel ?? "Selected classes",
        }
      : null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<keyof ClassWithStudents | null>(
    null,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(
    null,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedType, setExpandedType] = useState<
    "students" | "sims" | "reports" | null
  >(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [printClass, setPrintClass] = useState<ClassWithStudents | null>(null);
  const user = getParsedUser();
  const educatorSchools: Array<{ id: string; school_name: string }> =
    ((user as Record<string, unknown> | null)?.schools as Array<{
      id: string;
      school_name: string;
    }>) ?? [];
  const [filterValues, setFilterValues] = useState<FilterState>({
    className: "",
    status: "",
  });

  const [appliedFilter, setAppliedFilter] = useState<FilterState>({
    className: "",
    status: "",
  });

  const allClassesRef = useRef<ClassWithStudents[]>([]);
  const allClasses = useMemo<ClassWithStudents[]>(
    () =>
      classResponse?.data?.classes?.map((cls) => ({
        ...cls,
        sims: cls.sims ?? [],
        students: cls.students ?? [],
      })) ?? [],
    [classResponse],
  );

  const localNeedsAttentionById = useMemo<Record<string, boolean>>(() => {
    const result: Record<string, boolean> = {};
    for (const cls of allClasses) {
      const id = cls.id;
      if (id in needAttentionByClassId) {
        result[id] = needAttentionByClassId[id] > 0;
      } else if (id in needsAttentionByIdMap) {
        result[id] = needsAttentionByIdMap[id] === true;
      } else {
        result[id] = cls.needsAttention === true;
      }
    }
    return result;
  }, [allClasses, needsAttentionByIdMap, needAttentionByClassId]);

  const reportsByClassId = useMemo(() => {
    const map = new Map<string, typeof reports>();
    for (const cls of allClasses) {
      const userIds = new Set<string>();
      for (const s of cls.students ?? []) {
        if (s.user_id) userIds.add(s.user_id);
        if (s.student_id) userIds.add(s.student_id);
      }
      map.set(
        cls.id,
        reports.filter((r) => r.userId != null && userIds.has(r.userId)),
      );
    }
    return map;
  }, [allClasses, reports]);

  // Classes needing attention, bucketed like the educator dashboard's card:
  // no active students, no assigned sims, or unread reports. Computed across the
  // FULL class list (independent of the current search/tab/filter).
  const classAttention = useMemo(() => {
    const noStudents: ClassWithStudents[] = [];
    const noSims: ClassWithStudents[] = [];
    const unread: ClassWithStudents[] = [];
    allClasses.forEach((cls) => {
      if (getActiveStudentCount(cls) === 0) noStudents.push(cls);
      if ((cls.sims?.length ?? 0) === 0) noSims.push(cls);
      if ((needAttentionByClassId[cls.id] ?? 0) > 0) unread.push(cls);
    });
    const needing = new Set<string>([
      ...noStudents.map((c) => c.id),
      ...noSims.map((c) => c.id),
      ...unread.map((c) => c.id),
    ]);
    return { noStudents, noSims, unread, needing };
  }, [allClasses, needAttentionByClassId]);

  // Attention-tile buttons filter the table in-place via the "Showing:" chip.
  const applyAttentionFilter = (list: ClassWithStudents[], label: string) => {
    setActiveTab("all");
    setSearchTerm("");
    setIdFilter({ ids: list.map((c) => c.id), label });
  };

  // Open the create-class modal (shared by the header + bottom Add Class buttons).
  const handleAddClass = () => {
    setModalMode("create");
    setSelectedClass(null);
    setIsModalOpen(true);
  };

  const syncedStatusRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    allClassesRef.current = allClasses;
    if (!allClasses.length) return;

    const staleClasses = allClasses.filter((cls) => {
      if (
        cls.status === "DRAFT" ||
        cls.status === "ARCHIEVED" ||
        cls.status === "INACTIVE" ||
        cls.status === "ATTENTION"
      )
        return false;
      if (syncedStatusRef.current.has(cls.id)) return false;
      const correct = computeClassStatus(cls.start_date, cls.end_date);
      return cls.status?.toUpperCase() !== correct;
    });

    if (!staleClasses.length) return;

    staleClasses.forEach((cls) => {
      syncedStatusRef.current.add(cls.id);
      const correctStatus = computeClassStatus(cls.start_date, cls.end_date);
      void dispatch(
        UpdateClassRequest({
          id: cls.id,
          data: {
            class_name: cls.class_name,
            status: correctStatus,
            start_date: cls.start_date ?? "",
            end_date: cls.end_date ?? "",
          },
        }),
      );
    });
  }, [allClasses, dispatch]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get(`${config.GetEducatorAPI}/profile`, {
        headers: { "ngrok-skip-browser-warning": "true" },
        signal: controller.signal,
      })
      .then((res) => {
        const schools = (res.data?.data?.schools ?? res.data?.schools) as
          | { id: string; school_name: string }[]
          | undefined;
        if (Array.isArray(schools)) {
          updateStoredUser({ schools });
        }
      })
      .catch(() => {});
    return () => {
      controller.abort();
    };
  }, []);

  const classStatusOptions = useMemo(() => {
    const statusLabelMap: Record<string, string> = {
      ACTIVE: classLocale.statusActive,
      INACTIVE: classLocale.statusInactive,
      DRAFT: classLocale.statusDraft,
      ARCHIEVED: classLocale.statusArchived,
      ATTENTION: classLocale.statusNeedAttention,
    };
    return Array.from(
      new Set(
        allClasses
          .map((cls) => (cls.status || "").trim())
          .filter(Boolean)
          .map((status) => status.toUpperCase()),
      ),
    )
      .sort()
      .map((status) => ({
        value: status,
        label: statusLabelMap[status] ?? formatStatusLabel(status),
      }));
  }, [allClasses, classLocale]);

  const lastAppliedExpansion = useRef("");
  useEffect(() => {
    if (
      !locationState?.classId ||
      !locationState?.expandType ||
      allClasses.length === 0
    ) {
      return;
    }

    const expansionKey = `${location.key}:${locationState.classId}:${locationState.expandType}:${locationState.simulationId ?? ""}`;
    if (lastAppliedExpansion.current === expansionKey) {
      return;
    }

    lastAppliedExpansion.current = expansionKey;
    setActiveTab("all");
    setSearchTerm("");
    setAppliedFilter({ className: "", status: "" });
    setFilterValues({ className: "", status: "" });
    setExpandedId(locationState.classId);
    setExpandedType(locationState.expandType);
  }, [location.key, locationState, allClasses.length]);

  useEffect(() => {
    void handleGetClasses();
  }, []);

  const handleGetClasses = async () => {
    if (!user || user.role !== "Educator") return;

    let launchSyncSucceeded = false;

    const hasCachedClasses = classStatus === "succeeded" && classes.length > 0;
    if (!hasCachedClasses) {
      try {
        dispatch(setLoading(true));
        try {
          launchSyncSucceeded = await runLtiLaunchSyncIfNeeded(dispatch);
          await resyncLmsRostersIfConfigured(dispatch);
        } catch {
          return;
        }
        await Promise.all([
          dispatch(FetchClassesRequest()).unwrap(),
          dispatch(
            GetEducatorSimulationReports({ educatorId: user.id as string }),
          ).unwrap(),
        ]);
      } catch {
        return;
      } finally {
        if (launchSyncSucceeded) {
          finishLmsLaunchSession();
        }
        dispatch(setLoading(false));
      }
      return;
    }

    try {
      launchSyncSucceeded = await runLtiLaunchSyncIfNeeded(dispatch);
      await resyncLmsRostersIfConfigured(dispatch);
    } catch {
      // Launch sync/resync failed — still refresh the class list below.
    }
    void dispatch(FetchClassesRequest());
    void dispatch(
      GetEducatorSimulationReports({ educatorId: user.id as string }),
    );
    if (launchSyncSucceeded) {
      finishLmsLaunchSession();
    }
  };

  const handleFormSubmit = async (
    values: ClassFormValues,
    studentMode: "import" | "manual" | null,
    selectedFile: File | null,
    setFileError: (msg: string | null) => void,
  ) => {
    try {
      if (modalMode === "edit" && selectedClass) {
        const originalStatus =
          selectedClass.status === "DRAFT" ||
          selectedClass.status === "ARCHIEVED" ||
          selectedClass.status === "INACTIVE"
            ? selectedClass.status
            : computeClassStatus(
                selectedClass.start_date,
                selectedClass.end_date,
              );
        const originalSchoolId = selectedClass.school_id ?? "";
        const isSame =
          values.class_name === selectedClass.class_name &&
          values.status === originalStatus &&
          values.start_date === selectedClass.start_date?.split("T")[0] &&
          values.end_date === selectedClass.end_date?.split("T")[0] &&
          (values.school_id ?? "") === originalSchoolId;

        if (isSame) {
          toast.error("No changes made");
          return;
        }

        try {
          await dispatch(
            UpdateClassRequest({
              id: selectedClass.id,
              data: {
                class_name: values.class_name,
                status: values.status as
                  | "ACTIVE"
                  | "DRAFT"
                  | "INACTIVE"
                  | "ARCHIEVED"
                  | "ATTENTION",
                start_date: values.start_date,
                end_date: values.end_date,
                ...(values.school_id ? { school_id: values.school_id } : {}),
              },
            }),
          ).unwrap();

          dispatch(
            patchClassInStore({
              id: selectedClass.id,
              class_name: values.class_name,
              status: values.status,
              start_date: values.start_date,
              end_date: values.end_date,
              ...(values.school_id
                ? {
                    school_id: values.school_id,
                    school_name: educatorSchools.find(
                      (s) => s.id === values.school_id,
                    )?.school_name,
                  }
                : {}),
            }),
          );
          toast.success(CLASS_TOAST.UPDATED);
          setIsModalOpen(false);
          void handleGetClasses();
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          if (
            errorMsg.toLowerCase().includes("class") &&
            errorMsg.toLowerCase().includes("exists")
          ) {
            toast.error("Class name already exists");
          } else {
            toast.error(errorMsg || "Failed to update class");
          }
        }
        return;
      }

      if (modalMode === "create") {
        const isDuplicate = allClasses.some(
          (cls) =>
            cls.class_name?.trim().toLowerCase() ===
            values.class_name.trim().toLowerCase(),
        );

        if (isDuplicate) {
          toast.error("Class name already exists");
          return;
        }

        if (studentMode === "import" && !selectedFile) {
          setFileError(CLASS_TOAST.FILE_REQUIRED);
          toast.error(CLASS_TOAST.FILE_REQUIRED);
          return;
        }

        const basePayload: PostClassPayload = {
          school_id: values.school_id || undefined,
          class_name: values.class_name,
          status: values.status as PostClassPayload["status"],
          start_date: values.start_date,
          end_date: values.end_date,
        };

        if (studentMode === "import" && selectedFile) {
          let parsedStudents: Student[] = [];

          try {
            const parsedStudent = await parseFileToStudentArray(selectedFile);
            const codesFromFile = parsedStudent
              .map((item) => item.student_id?.trim())
              .filter((c): c is string => !!c && isValidAccessCode(c));
            const usedCodes = new Set<string>([
              ...existingStudentCodes,
              ...codesFromFile,
            ]);

            const studentsNeedingCode = parsedStudent.filter(
              (item) =>
                !item.student_id?.trim() ||
                !isValidAccessCode(item.student_id.trim()),
            );
            const generatedCodes = generateUniqueStudentCodes(
              studentsNeedingCode.length,
              usedCodes,
              values.class_name,
            );
            let genIdx = 0;

            parsedStudents = parsedStudent.map((item) => {
              const existingCode = item.student_id?.trim();
              const studentCode =
                existingCode && isValidAccessCode(existingCode)
                  ? existingCode
                  : generatedCodes[genIdx++];
              return {
                student_id: studentCode,
                student_name: item.student_name || "",
                email: item.email || "",
                score: Number(item.score) || null,
              };
            });
          } catch (err: unknown) {
            const msg =
              err instanceof Error ? err.message : CLASS_TOAST.FILE_PARSE_ERROR;
            setFileError(msg);
            toast.error(msg);
            return;
          }

          if (parsedStudents.length === 0) {
            setFileError(CLASS_TOAST.FILE_EMPTY);
            toast.error(CLASS_TOAST.FILE_EMPTY);
            return;
          }

          await dispatch(
            PostClassRequest({
              ...basePayload,
              students: parsedStudents,
            }),
          ).unwrap();
        } else if (studentMode === "manual" && values.total_no_of_students) {
          await dispatch(
            PostClassRequest({
              ...basePayload,
              total_no_of_students: Number(values.total_no_of_students),
            }),
          ).unwrap();
        } else {
          await dispatch(PostClassRequest(basePayload)).unwrap();
        }

        toast.success(CLASS_TOAST.CREATED);
        setIsModalOpen(false);

        void handleGetClasses();
      }
    } catch (err: unknown) {
      const message =
        (err as { message?: string })?.message ||
        (modalMode === "edit"
          ? CLASS_TOAST.UPDATE_ERROR
          : CLASS_TOAST.CREATE_ERROR);
      toast.error(message);
      setIsModalOpen(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedClass) return;

    try {
      await dispatch(DeleteClassRequest(selectedClass.id)).unwrap();
      toast.success(CLASS_TOAST.DELETED);
      setIsModalOpen(false);
      handleGetClasses();
    } catch {
      toast.error(CLASS_TOAST.DELETE_ERROR);
    }
  };

  const handleSort = useCallback(
    (field: keyof ClassWithStudents) => {
      if (sortField === field) {
        setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      } else {
        setSortField(field);
        setSortDirection("asc");
      }
    },
    [sortField, sortDirection],
  );

  const toggleExpand = useCallback(
    (
      id: string,
      type: "students" | "sims" | "reports",
      e: React.MouseEvent | React.KeyboardEvent,
    ) => {
      e.stopPropagation();

      if (expandedId === id && expandedType === type) {
        setExpandedId(null);
        setExpandedType(null);
      } else {
        setExpandedId(id);
        setExpandedType(type);
      }
    },
    [expandedId, expandedType],
  );

  // Resolve a class's school name (for grouping + the school filter); "No
  // School" sinks to the end of the grouped list.
  const schoolNameById = useMemo(() => {
    const u = getParsedUser();
    const schools = (u?.schools ?? []) as Array<{
      id: string;
      school_name: string;
    }>;
    return new Map(schools.map((s) => [s.id, s.school_name]));
  }, []);
  const resolveSchoolNameForGroup = useCallback(
    (cls: ClassWithStudents): string =>
      cls.school_name ||
      (cls.school_id ? schoolNameById.get(cls.school_id) : undefined) ||
      "No School",
    [schoolNameById],
  );

  // Distinct school names present across all classes, for the School filter.
  const classSchoolOptions = useMemo(
    () =>
      Array.from(new Set(allClasses.map(resolveSchoolNameForGroup)))
        .sort((a, b) =>
          a === "No School" ? 1 : b === "No School" ? -1 : a.localeCompare(b),
        )
        .map((name) => ({ value: name, label: name })),
    [allClasses, resolveSchoolNameForGroup],
  );

  // Applied-filter chips (rendered below the header) — same UX as the admin
  // tables: each chip removes just that value; Clear All resets everything.
  const activeClassFilterChips = useMemo(() => {
    const chips: {
      key: string;
      label: string;
      value: string;
      displayValue: string;
    }[] = [];
    (appliedFilter.schools ?? []).forEach((name) =>
      chips.push({ key: `schools::${name}`, label: "School", value: name, displayValue: name }),
    );
    (appliedFilter.classNames ?? []).forEach((name) =>
      chips.push({
        key: `classNames::${name}`,
        label: "Class Name",
        value: name,
        displayValue: name,
      }),
    );
    (appliedFilter.statuses ?? []).forEach((st) =>
      chips.push({
        key: `statuses::${st}`,
        label: "Class Status",
        value: st,
        displayValue: classStatusOptions.find((o) => o.value === st)?.label ?? st,
      }),
    );
    if (appliedFilter.startDate)
      chips.push({
        key: `startDate::${appliedFilter.startDate}`,
        label: "Class Start Date (on/after)",
        value: appliedFilter.startDate,
        displayValue: dayjs(appliedFilter.startDate).format("MM-DD-YYYY"),
      });
    if (appliedFilter.endDate)
      chips.push({
        key: `endDate::${appliedFilter.endDate}`,
        label: "Class End Date (on/before)",
        value: appliedFilter.endDate,
        displayValue: dayjs(appliedFilter.endDate).format("MM-DD-YYYY"),
      });
    return chips;
  }, [appliedFilter, classStatusOptions]);

  const hasActiveClassFilters = activeClassFilterChips.length > 0;

  const handleRemoveClassFilter = (key: string) => {
    const sep = key.indexOf("::");
    const field = key.slice(0, sep);
    const value = key.slice(sep + 2);
    const updater = (f: FilterState): FilterState => {
      if (field === "schools")
        return { ...f, schools: (f.schools ?? []).filter((v) => v !== value) };
      if (field === "classNames")
        return { ...f, classNames: (f.classNames ?? []).filter((v) => v !== value) };
      if (field === "statuses")
        return { ...f, statuses: (f.statuses ?? []).filter((v) => v !== value) };
      if (field === "startDate") return { ...f, startDate: "" };
      if (field === "endDate") return { ...f, endDate: "" };
      return f;
    };
    setAppliedFilter(updater);
    setFilterValues(updater);
  };

  const handleClearAllClassFilters = () => {
    const cleared: FilterState = {
      className: "",
      status: "",
      classNames: [],
      statuses: [],
      schools: [],
      startDate: "",
      endDate: "",
    };
    setAppliedFilter(cleared);
    setFilterValues(cleared);
  };

  const filteredClasses = useMemo<ClassWithStudents[]>(
    () =>
      allClasses.filter((cls) => {
        const matchesSearch = cls.class_name
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase());

        const effectiveStatus = getEffectiveClassStatus(
          cls.status,
          cls.start_date,
          cls.end_date,
        );

        const matchesStatus =
          activeTab === "all" ||
          (activeTab === "active" && effectiveStatus === "ACTIVE") ||
          (activeTab === "draft" && effectiveStatus === "DRAFT") ||
          (activeTab === "archived" && effectiveStatus === "ARCHIEVED") ||
          (activeTab === "needAttention" &&
            (localNeedsAttentionById[cls.id] === true ||
              effectiveStatus === "ATTENTION"));

        const matchesFilterName =
          !appliedFilter.classNames?.length ||
          appliedFilter.classNames.includes(cls.class_name);
        const matchesFilterStatus =
          !appliedFilter.statuses?.length ||
          appliedFilter.statuses.includes(effectiveStatus);

        const matchesSchool =
          !appliedFilter.schools?.length ||
          appliedFilter.schools.includes(resolveSchoolNameForGroup(cls));

        const matchesStartDate =
          !appliedFilter.startDate ||
          (!!cls.start_date &&
            !dayjs(cls.start_date).isBefore(
              dayjs(appliedFilter.startDate),
              "day",
            ));
        const matchesEndDate =
          !appliedFilter.endDate ||
          (!!cls.end_date &&
            !dayjs(cls.end_date).isAfter(dayjs(appliedFilter.endDate), "day"));

        const matchesIdFilter = !idFilter || idFilter.ids.includes(cls.id);

        return (
          matchesSearch &&
          matchesStatus &&
          matchesFilterName &&
          matchesFilterStatus &&
          matchesSchool &&
          matchesStartDate &&
          matchesEndDate &&
          matchesIdFilter
        );
      }),
    [
      allClasses,
      searchTerm,
      activeTab,
      appliedFilter,
      localNeedsAttentionById,
      idFilter,
      resolveSchoolNameForGroup,
    ],
  );

  const sortedClasses = useMemo(
    () =>
      [...filteredClasses].sort((a, b) => {
        if (!sortField || !sortDirection) return 0;

        let aVal: string | number;
        let bVal: string | number;

        if (sortField === "reports") {
          aVal =
            reportsByClassId.get(a.id)?.length ??
            (typeof a.reportCount === "number"
              ? a.reportCount
              : Array.isArray(a.reports)
                ? a.reports.length
                : toSafeNumber(a.reports));
          bVal =
            reportsByClassId.get(b.id)?.length ??
            (typeof b.reportCount === "number"
              ? b.reportCount
              : Array.isArray(b.reports)
                ? b.reports.length
                : toSafeNumber(b.reports));
        } else if (sortField === "students") {
          aVal = (a.students ?? []).length;
          bVal = (b.students ?? []).length;
        } else if (sortField === "sims") {
          aVal = (a.sims ?? []).length;
          bVal = (b.sims ?? []).length;
        } else if (sortField === "school_name") {
          const schoolNameById = (() => {
            const u = getParsedUser();
            const schools = (u?.schools ?? []) as Array<{
              id: string;
              school_name: string;
            }>;
            return new Map(schools.map((s) => [s.id, s.school_name]));
          })();
          const resolveSchool = (cls: ClassWithStudents) =>
            cls.school_name ||
            (cls.school_id ? schoolNameById.get(cls.school_id) : undefined) ||
            "";
          const aStr = resolveSchool(a);
          const bStr = resolveSchool(b);
          const cmp = aStr.localeCompare(bStr, undefined, {
            sensitivity: "base",
          });
          return sortDirection === "asc" ? cmp : -cmp;
        } else {
          const aStr = String(a[sortField] ?? "");
          const bStr = String(b[sortField] ?? "");
          const cmp = aStr.localeCompare(bStr, undefined, {
            sensitivity: "base",
          });
          return sortDirection === "asc" ? cmp : -cmp;
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      }),
    [filteredClasses, sortField, sortDirection, reportsByClassId],
  );

  // Reorder the (already user-sorted) classes so same-school rows are contiguous
  // — schools alphabetical, "No School" last — so ListTable can group them.
  const groupedClasses = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<string, ClassWithStudents[]>();
    for (const cls of sortedClasses) {
      const key = resolveSchoolNameForGroup(cls);
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(cls);
    }
    order.sort((a, b) =>
      a === "No School" ? 1 : b === "No School" ? -1 : a.localeCompare(b),
    );
    return order.flatMap((k) => groups.get(k) ?? []);
  }, [sortedClasses, resolveSchoolNameForGroup]);

  const classColumns = useClassColumns({
    sortField,
    sortDirection,
    onSort: handleSort,
    expandedId,
    expandedType,
    labels: {
      className: classLocale.headerClassName,
      school: classLocale.headerSchoolName,
      students: classLocale.headerStudents,
      sims: classLocale.headerSims,
      reports: classLocale.headerReports,
      status: classLocale.headerStatus,
      ariaExpandClassDetails: classLocale.ariaExpandClassDetails,
      ariaCollapseClassDetails: classLocale.ariaCollapseClassDetails,
      statusActive: classLocale.statusActive,
      statusInactive: classLocale.statusInactive,
      statusDraft: classLocale.statusDraft,
      statusArchived: classLocale.statusArchived,
      statusNeedAttention: classLocale.statusNeedAttention,
    },
    onToggleExpand: toggleExpand,
  });

  const handleStatusChange = async (
    row: ClassWithStudents,
    status: NonNullable<Class["status"]>,
  ) => {
    try {
      await dispatch(
        UpdateClassRequest({
          id: row.id,
          data: {
            class_name: row.class_name,
            status,
            start_date: row.start_date ?? "",
            end_date: row.end_date ?? "",
          },
        }),
      ).unwrap();
      syncedStatusRef.current.add(row.id);
      toast.success(CLASS_TOAST.UPDATED);
      handleGetClasses();
    } catch {
      toast.error(classLocale.failedUpdate ?? "Failed to update class");
    }
  };

  const mergeStudentsWithLiveRoster = useCallback(
    (dbStudents: Student[], className: string): Student[] => {
      const liveStudents =
        liveRosterByClassName[className.toLowerCase().trim()] ?? [];
      if (!liveStudents.length) return dbStudents;

      const normalizeUserId = (value: unknown): string =>
        String(value ?? "")
          .trim()
          .replace(/^0+(?=\d)/, "");

      const extractLmsUserIdFromStudentCode = (
        studentCode: string | null | undefined,
      ): string => {
        const code = String(studentCode ?? "").trim();
        if (!code) return "";
        const parts = code.split("-");
        const suffix = parts[parts.length - 1]?.trim() ?? "";
        if (!suffix) return "";

        const legacyMatch = suffix.match(/^M0*(\d+)$/i);
        if (legacyMatch?.[1]) return normalizeUserId(legacyMatch[1]);
        if (/^\d+$/.test(suffix)) return normalizeUserId(suffix);
        return "";
      };

      const liveByUserId = new Map<string, LmsStudent>();
      for (const lmsStudent of liveStudents) {
        const rawKey = String(
          lmsStudent.userId ?? lmsStudent.user_id ?? lmsStudent.id ?? "",
        ).trim();
        const normalizedKey = normalizeUserId(rawKey);
        if (rawKey) liveByUserId.set(rawKey, lmsStudent);
        if (normalizedKey) liveByUserId.set(normalizedKey, lmsStudent);
      }

      if (!dbStudents.length) {
        return liveStudents.map((s, index) => {
          const id = String(s.userId ?? s.user_id ?? s.id ?? `lms-${index}`);
          const name =
            s.name ??
            `${s.given_name ?? ""} ${s.family_name ?? ""}`.trim() ??
            null;
          return {
            id,
            user_id: String(s.userId ?? s.user_id ?? s.id ?? "") || undefined,
            student_id: null,
            student_name: name || null,
            email: s.email ?? null,
            status: "ACTIVE",
            score: null,
          };
        });
      }

      return dbStudents.map((dbStudent, index) => {
        const runtimeDbStudent = dbStudent as Student & {
          studentName?: string | null;
          student_email?: string | null;
        };
        const dbUserIdRaw = String(dbStudent.user_id ?? "").trim();
        const dbUserIdNormalized = normalizeUserId(dbUserIdRaw);
        const codeSuffixUserId = extractLmsUserIdFromStudentCode(
          dbStudent.student_id,
        );

        const matched =
          (dbUserIdRaw ? liveByUserId.get(dbUserIdRaw) : undefined) ??
          (dbUserIdNormalized
            ? liveByUserId.get(dbUserIdNormalized)
            : undefined) ??
          (codeSuffixUserId ? liveByUserId.get(codeSuffixUserId) : undefined) ??
          liveStudents[index];

        const lmsName = matched
          ? (matched.name ??
            `${matched.given_name ?? ""} ${matched.family_name ?? ""}`.trim() ??
            null)
          : null;
        const mergedName =
          dbStudent.student_name ||
          runtimeDbStudent.studentName ||
          lmsName ||
          null;
        const mergedEmail =
          dbStudent.email ||
          runtimeDbStudent.student_email ||
          matched?.email ||
          null;

        return {
          ...dbStudent,
          student_name: mergedName,
          studentName: mergedName,
          email: mergedEmail,
          student_email: mergedEmail,
          user_id:
            dbStudent.user_id ||
            codeSuffixUserId ||
            String(matched?.userId ?? matched?.user_id ?? matched?.id ?? "") ||
            undefined,
        };
      });
    },
    [liveRosterByClassName],
  );

  return (
    <div className="px-4 pt-6">
      <Toast />

      <PageHeader
        title={classLocale.title}
        centerContent={
          classAttention.needing.size > 0 ? (
            <ProgressCard
              label="Classes Needing Attention"
              value={`${classAttention.needing.size} class${
                classAttention.needing.size !== 1 ? "es" : ""
              } with items needing attention`}
              progress={Math.min(classAttention.needing.size, allClasses.length)}
              total={Math.max(allClasses.length, 1)}
              subText="Classes with unread reports, no students, or no assigned simulations"
              icon={AlertTriangle}
              largeActions
              actions={[
                {
                  label: `View Classes with Unread Reports (${classAttention.unread.length})`,
                  onClick: () =>
                    applyAttentionFilter(
                      classAttention.unread,
                      "Classes with unread reports",
                    ),
                },
                {
                  label: `View Classes with No Students (${classAttention.noStudents.length})`,
                  onClick: () =>
                    applyAttentionFilter(
                      classAttention.noStudents,
                      "Classes with no students",
                    ),
                },
                {
                  label: `View Classes with No Assigned Sims (${classAttention.noSims.length})`,
                  onClick: () =>
                    applyAttentionFilter(
                      classAttention.noSims,
                      "Classes with no assigned simulations",
                    ),
                },
              ]}
            />
          ) : undefined
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
            {classLocale.addClass}
          </Button>
        }
      />

      <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden mt-4 mx-2 sm:mx-4">
        <div className="flex flex-wrap items-center gap-3 px-3 sm:px-4 py-3 sm:py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-auto">
            <div className="w-32 sm:w-52 md:w-64 min-w-0">
              <SearchBar
                value={searchTerm}
                onSearch={setSearchTerm}
                placeholder={classLocale.searchPlaceholder}
                debounceMs={1000}
                className="w-full"
              />
            </div>
            <Button
              variant="outline"
              aria-pressed={hasActiveClassFilters}
              aria-label={
                hasActiveClassFilters
                  ? `Filters applied (${activeClassFilterChips.length})`
                  : "Filter classes"
              }
              title={
                hasActiveClassFilters
                  ? `Filters applied (${activeClassFilterChips.length})`
                  : "Filter classes"
              }
              className={`relative w-10 h-10 sm:w-11 sm:h-11 flex-shrink-0 flex items-center justify-center rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 ${
                hasActiveClassFilters
                  ? "bg-[#5f6060] border-[#5f6060] text-white hover:bg-[#4f5050]"
                  : "border-gray-400"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setFilterOpen((o) => !o);
              }}
            >
              <Filter size={20} strokeWidth={2.5} aria-hidden="true" />
              {hasActiveClassFilters && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary-500 text-white text-[10px] font-bold leading-none">
                  {activeClassFilterChips.length}
                </span>
              )}
            </Button>
          </div>
        </div>

        {filterOpen && (
          <div className="px-4 pt-4 py-2" onClick={(e) => e.stopPropagation()}>
            <FilterPanel
              title={classLocale.filterTitle}
              applyLabel={classLocale.applyFilter ?? "Apply Filter"}
              resetLabel={classLocale.resetFilter ?? "Reset Filter"}
              noFiltersMessage={classLocale.noFiltersApplied}
              onApply={() => {
                setAppliedFilter({ ...filterValues });
                setFilterOpen(false);
              }}
              onReset={() => {
                const cleared = {
                  className: "",
                  status: "",
                  classNames: [],
                  statuses: [],
                  schools: [],
                  startDate: "",
                  endDate: "",
                };
                setFilterValues(cleared);
                setAppliedFilter(cleared);
              }}
              onClose={() => {
                setFilterValues({ ...appliedFilter });
                setFilterOpen(false);
              }}
              fields={[
                {
                  label: "School",
                  placeholder: "Select school(s)",
                  multiple: true,
                  values: filterValues.schools ?? [],
                  onValuesChange: (vals: string[]) =>
                    setFilterValues((f) => ({ ...f, schools: vals })),
                  value: "",
                  onChange: () => undefined,
                  options: classSchoolOptions,
                  searchable: true,
                },
                {
                  label: classLocale.filterClassName,
                  placeholder: classLocale.filterClassNamePlaceholder,
                  multiple: true,
                  values: filterValues.classNames ?? [],
                  onValuesChange: (vals: string[]) =>
                    setFilterValues((f) => ({ ...f, classNames: vals })),
                  value: "",
                  onChange: () => undefined,
                  options: Array.from(
                    new Set(
                      allClasses.map((cls) => cls.class_name).filter(Boolean),
                    ),
                  )
                    .sort()
                    .map((name) => ({ value: name, label: name })),
                  searchable: true,
                },
                {
                  label: "Class Status",
                  placeholder: classLocale.filterStatusPlaceholder,
                  multiple: true,
                  values: filterValues.statuses ?? [],
                  onValuesChange: (vals: string[]) =>
                    setFilterValues((f) => ({ ...f, statuses: vals })),
                  value: "",
                  onChange: () => undefined,
                  options: classStatusOptions,
                  searchable: true,
                },
                {
                  label: "Class Start Date (on/after)",
                  type: "date",
                  value: filterValues.startDate ?? "",
                  placeholder: "",
                  onChange: (val: string) =>
                    setFilterValues((f) => ({ ...f, startDate: val })),
                  options: [],
                },
                {
                  label: "Class End Date (on/before)",
                  type: "date",
                  value: filterValues.endDate ?? "",
                  placeholder: "",
                  onChange: (val: string) =>
                    setFilterValues((f) => ({ ...f, endDate: val })),
                  options: [],
                },
              ]}
            />
          </div>
        )}

        {idFilter && (
          <div className="px-3 sm:px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-gray-500">Showing:</span>
            <span className="inline-flex items-center gap-2 bg-[#5f6060] text-white text-xs font-medium rounded-full px-3 py-1">
              {idFilter.label} ({idFilter.ids.length})
              <button
                type="button"
                onClick={() => setIdFilter(null)}
                aria-label="Clear filter"
                className="hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded"
              >
                ×
              </button>
            </span>
          </div>
        )}

        {hasActiveClassFilters && (
          <FilterChips
            filters={activeClassFilterChips}
            onRemove={handleRemoveClassFilter}
            onClearAll={handleClearAllClassFilters}
          />
        )}

        <div className="overflow-x-auto">
          <ListTable
            columns={classColumns}
            data={groupedClasses}
            groupBy={resolveSchoolNameForGroup}
            renderGroupHeader={(name) =>
              name === "No School" ? "No School" : `School: ${name}`
            }
            emptyMessage={classLocale.noDataFound}
            actionHeader={classLocale.headerActions}
            targetRowId={targetClassId}
            rowClassName={() => ""}
            renderSubRow={(row) => {
              if (expandedId !== row.id) {
                return null;
              }
              if (expandedType === "students") {
                return (
                  <StudentSubTable
                    students={mergeStudentsWithLiveRoster(
                      row.students || [],
                      row.class_name,
                    )}
                    classId={row.id}
                    className={row.class_name}
                    onStudentAdded={handleGetClasses}
                    closeStudentMenu={openMenuId !== null}
                    onStudentMenuOpen={() => setOpenMenuId(null)}
                    isClassInactive={row.status?.toUpperCase() === "ARCHIEVED"}
                    isStatus={row.status}
                    defaultReportsStudentId={
                      locationState?.openStudentReports &&
                      row.id === targetClassId
                        ? locationState.studentId
                        : undefined
                    }
                    defaultPinStudentId={
                      locationState?.pinStudentId && row.id === targetClassId
                        ? locationState.pinStudentId
                        : undefined
                    }
                  />
                );
              }
              if (expandedType === "sims") {
                return (
                  <SimSubTable
                    classId={row.id}
                    className={row.class_name}
                    classStartDate={row.start_date ?? ""}
                    classEndDate={row.end_date ?? ""}
                    simulations={row.sims ?? []}
                    reports={
                      (reportsByClassId.get(row.id) ??
                        []) as unknown as ComponentProps<
                        typeof SimSubTable
                      >["reports"]
                    }
                    students={mergeStudentsWithLiveRoster(
                      row.students || [],
                      row.class_name,
                    )}
                    isClassArchived={row.status?.toUpperCase() === "ARCHIEVED"}
                    targetSimulationId={
                      expandedId === row.id && expandedType === "sims"
                        ? (targetSimulationId ?? undefined)
                        : undefined
                    }
                    defaultSimReportsId={
                      locationState?.openSimReports && row.id === targetClassId
                        ? locationState.simId
                        : undefined
                    }
                  />
                );
              }

              if (expandedType === "reports") {
                return (
                  <ReportSubTable
                    classId={row.id}
                    reports={
                      (reportsByClassId.get(row.id) ??
                        []) as unknown as ComponentProps<
                        typeof ReportSubTable
                      >["reports"]
                    }
                    isClassInactive={row.status?.toUpperCase() === "ARCHIEVED"}
                    targetScenarioId={
                      expandedId === row.id
                        ? (targetSimulationId ?? undefined)
                        : undefined
                    }
                  />
                );
              }
            }}
            renderActions={(row) => (
              <ClassRowActions
                row={row}
                openMenuId={openMenuId}
                openStatusId={openStatusId}
                onMenuToggle={setOpenMenuId}
                onStatusToggle={setOpenStatusId}
                onEdit={(r) => {
                  setSelectedClass(r);
                  setModalMode("edit");
                  setIsModalOpen(true);
                }}
                onDelete={(r) => {
                  setSelectedClass(r);
                  setModalMode("delete");
                  setIsModalOpen(true);
                }}
                onStatusChange={handleStatusChange}
                onPrint={(r) => {
                  setPrintClass(r);
                }}
                onAIInsights={() => {}}
                defaultViewModalOpen={
                  locationState?.openReportsModal === true &&
                  row.id === targetClassId
                }
              />
            )}
          />
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
          {classLocale.addClass}
        </Button>
      </div>

      <ClassFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        modalMode={modalMode}
        selectedClass={selectedClass}
        deleteStatus={String(deleteStatus)}
        onConfirmDelete={confirmDelete}
        onSubmit={handleFormSubmit}
      />

      <PrintAccessCodeModal
        isOpen={!!printClass}
        onClose={() => setPrintClass(null)}
        className={printClass?.class_name ?? ""}
        mode="bulk"
        students={
          printClass?.students?.map((s) => ({
            studentName: s.student_name ?? "",
            accessCode: s.student_id ?? "",
          })) ?? []
        }
      />
    </div>
  );
}
