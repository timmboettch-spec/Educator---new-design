import React, { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import { toast, sonnerToast } from "../../components/common/Toast";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import SelectField from "../../components/ui/Select";
import MultiSelect from "../../components/ui/MultiSelect";
import { getParsedUser } from "../../utils/storage";
import {
  addSimulationRequest,
  clearAddSimulationState,
  clearSimulationsByUnit,
  selectAddSimLoading,
  type UnitSimulation,
} from "../../redux/dashboard/simulationlibrary/addsimulationredux";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  FetchClassesRequest,
  selectClasses,
  selectClassListLoading,
} from "../../redux/class/GetClassRedux";
import {
  PostClassRequest,
  type PostClassPayload,
} from "../../redux/class/PostClassRedux";
import { Class } from "../../types/Class_types";
import {
  fetchMyLibrarySimulations,
  selectSimulationLibraryData,
  type Simulation,
} from "../../redux/dashboard/simulationlibrary/GetSimulationRedux";
import { SimulationItem, Student, type Subscription } from "@/types";
import { listProductUnits } from "../myproducts/ProductEntitlements";
import { isAISimulation } from "@/utils/simulationType";
import { fetchNotifications } from "@/redux/notifications/NotificationsRedux";
import ConfirmModal from "./ConfirmationModal";

dayjs.extend(customParseFormat);

const toMMDDYYYY = (yyyymmdd: string): string => {
  if (!yyyymmdd) return "";
  const [y, m, d] = yyyymmdd.split("-");
  return `${m}-${d}-${y}`;
};

const toInputDate = (raw?: string): string => {
  if (!raw) return "";
  let parsed = dayjs(raw, "YYYY-MM-DD", true);
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  parsed = dayjs(raw, "MM-DD-YYYY", true);
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  parsed = dayjs(raw, "MM/DD/YYYY", true);
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  parsed = dayjs(raw);
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  return "";
};

const NO_SCHOOL_KEY = "__no_school__";
// Stable key for grouping/filtering classes by school (id preferred, then name).
const schoolKeyOf = (c: Class): string =>
  c.school_id || c.school_name || NO_SCHOOL_KEY;
const fmtClassDate = (raw?: string): string => {
  const d = toInputDate(raw);
  return d ? dayjs(d).format("MM-DD-YYYY") : "—";
};

interface AddSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssigned?: () => void | Promise<void>;
  unitId?: string;
  simulationId?: string;
  /** Pre-select multiple simulations (bulk assign from the library). */
  simulationIds?: string[];
  classId?: string;
  classEndDate?: string;
  students: Student[];
  simulations: Simulation[] | SimulationItem[];
}

const AddSimulationModal: React.FC<AddSimulationModalProps> = ({
  isOpen,
  onClose,
  onAssigned,
  unitId: _unitId,
  simulationId,
  simulationIds,
  classId,
  classEndDate,
  students,
  simulations
}) => {
  const dispatch = useAppDispatch();
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).addSimModal;
  const isLoading = useAppSelector(selectAddSimLoading);
  const classList = useAppSelector(selectClasses) ?? [];
  const classesLoading = useAppSelector(selectClassListLoading);
  const simulationLib = useAppSelector(selectSimulationLibraryData);
  const simulationLibRef = useRef<Simulation[]>([]);

  useEffect(() => {
    simulationLibRef.current = simulationLib;
  }, [simulationLib]);

  const isClassContext = !!classId;
  // The School + Class selectors are ALWAYS shown now (identical to the library
  // modal); in class context they're just pre-defaulted to the inherited class.
  const showClassFields = true;
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const schoolDefaultedRef = useRef(false);
  const classCtxSeededRef = useRef(false);
  // Inline "create a class" form (opened from the Class Name selector when the
  // typed name doesn't exist yet — mirrors the admin inline school/educator flow).
  const [newClass, setNewClass] = useState<{
    name: string;
    start: string;
    end: string;
    students: string;
    status: string;
  } | null>(null);
  const [creatingClass, setCreatingClass] = useState(false);
  const [newClassError, setNewClassError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Simulation | null>(null);
  const [selectedSimulations, setSelectedSimulations] = useState<UnitSimulation[]>([]);
  const [loadedUnitId, setLoadedUnitId] = useState<string>("");
  const [allScenarios, setAllScenarios] = useState<UnitSimulation[]>([]);
  const [allScenariosLoading, setAllScenariosLoading] = useState(true);
  // Pre-filters that narrow the Simulation Name list.
  const [filterModality, setFilterModality] = useState("");
  const [filterAudience, setFilterAudience] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDateVal, setDueDateVal] = useState("");
  const [endDateVal, setEndDateVal] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const [errors, setErrors] = useState<{
    school?: string;
    class?: string;
    simulation?: string;
    unit?: string;
    startDate?: string;
    dueDate?: string;
    endDate?: string;
  }>({});

  useEffect(() => {
    if (!isOpen) return;
    resetState();
    const init = async () => {
      setAllScenariosLoading(true);
      loadClasses();
      const cachedLibrary = simulationLibRef.current;
      const hasCachedLibrary =
        Array.isArray(cachedLibrary) && cachedLibrary.length > 0;

      if (hasCachedLibrary) {
        await loadAllScenarios(cachedLibrary);
        setAllScenariosLoading(false);

        void loadSimulationLibrary().then((lib) => {
          if (lib && lib.length > 0) {
            void loadAllScenarios(lib);
          }
        });
        return;
      }

      try {
        const lib = await loadSimulationLibrary();
        if (lib && lib.length > 0) {
          await loadAllScenarios(lib);
        } else {
          setAllScenarios([]);
        }
      } finally {
        setAllScenariosLoading(false);
      }
    };
    void init();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || classList.length === 0) return;
    // Class context: seed the School + Class selectors from the inherited class
    // (still editable, exactly like the library modal — just pre-defaulted).
    if (isClassContext && !classCtxSeededRef.current) {
      const current = classList.find((c: Class) => c.id === classId);
      if (current) {
        classCtxSeededRef.current = true;
        schoolDefaultedRef.current = true;
        setSelectedSchoolId(schoolKeyOf(current));
        setSelectedClassIds([current.id]);
        setStartDate(toInputDate(current.start_date));
        setEndDateVal(toInputDate(current.end_date) || toInputDate(classEndDate));
        return;
      }
    }
    const activeClasses = classList.filter(
      (c: Class) => c.status?.toUpperCase() !== "ARCHIEVED",
    );
    // Default the School selector when there's exactly one school to choose
    // (across the educator's own schools + any school on their classes). No class
    // is selected by default — the educator picks one or more.
    const userSchoolIds = (
      (getParsedUser()?.schools as Array<{ id?: string }> | undefined) ?? []
    )
      .map((s) => s.id)
      .filter((v): v is string => Boolean(v));
    const schoolKeys = Array.from(
      new Set([...userSchoolIds, ...activeClasses.map(schoolKeyOf)]),
    );
    if (!schoolDefaultedRef.current && schoolKeys.length === 1) {
      schoolDefaultedRef.current = true;
      setSelectedSchoolId(schoolKeys[0]);
    }
  }, [isOpen, classList, isClassContext, classId, classEndDate]);

  useEffect(() => {
    if (!loadedUnitId || selectedUnit || simulationLib.length === 0) return;
    const match = simulationLib.find((s) => s.unit === loadedUnitId) ?? null;
    if (match) setSelectedUnit(match);
  }, [loadedUnitId, simulationLib]);

  useEffect(() => {
    const preselect =
      simulationIds && simulationIds.length
        ? simulationIds
        : simulationId
          ? [simulationId]
          : [];
    if (
      !isOpen ||
      preselect.length === 0 ||
      allScenarios.length === 0 ||
      selectedSimulations.length > 0
    )
      return;
    const ids = preselect
      .map((pid) => allScenarios.find((s) => String(s.id) === String(pid))?.id)
      .filter((v): v is string => Boolean(v));
    if (ids.length) handleSimulationsChange(ids);
  }, [isOpen, simulationId, simulationIds, allScenarios]);

  if (!isOpen) return null;

  const loadClasses = async () => {
    try {
      await dispatch(FetchClassesRequest()).unwrap();
    } catch {
      return;
    }
  };

  const loadSimulationLibrary = async (): Promise<Simulation[]> => {
    try {
      const result = await dispatch(fetchMyLibrarySimulations()).unwrap();
      const r = result as { data?: Simulation[] };
      return r.data ?? [];
    } catch {
      return [];
    }
  };

  const loadAllScenarios = async (lib: Simulation[]) => {
    const scenarios: UnitSimulation[] = lib
      .filter((s) => s.id)
      .map((s) => ({
        id: s.id,
        simulation_id: s.simulation_id,
        title: s.title || s.name || "",
        unit_id: s.unit,
        unit_name: s.unit_name || s.name || s.title || "",
        imageURL: s.image || "",
        description: s.description || "",
        difficulty: s.difficulty || "",
        learnerLevel: s.learnerLevel || "",
        avatarEnabled: s.avatarEnabled,
      }));
    setAllScenarios(scenarios);
  };

  const handleSimulationsChange = (vals: string[]) => {
    if (allScenariosLoading) return;
    setErrors((e) => ({ ...e, unit: undefined, simulation: undefined }));
    const chosen = vals
      .map((v) => allScenarios.find((s) => s.id === v))
      .filter((s): s is UnitSimulation => Boolean(s));
    setSelectedSimulations(chosen);
    const first = chosen[0] ?? null;
    setLoadedUnitId(first?.unit_id ?? "");
    if (!first) {
      setSelectedUnit(null);
      return;
    }
    const syntheticUnit: Simulation = {
      id: first.unit_id ?? "",
      simulation_id: first.unit_id ?? "",
      unit: first.unit_id ?? "",
      unit_name: first.unit_name ?? "",
      name: first.unit_name ?? "",
      title: first.unit_name ?? "",
      duration: "",
      image: "",
      description: "",
      assigned: false,
      rating: 0,
      difficulty: "",
      learnerLevel: "",
      avatarEnabled: first.avatarEnabled,
    };
    setSelectedUnit(syntheticUnit);
  };

  const resetState = () => {
    dispatch(clearAddSimulationState());
    dispatch(clearSimulationsByUnit());
    setSelectedSimulations([]);
    setSelectedUnit(null);
    setLoadedUnitId("");
    setDueDateVal("");
    setAllScenarios([]);
    setAllScenariosLoading(true);
    setSelectedSchoolId("");
    setSelectedClassIds([]);
    schoolDefaultedRef.current = false;
    classCtxSeededRef.current = false;
    setStartDate("");
    setEndDateVal("");
  };

  const handleSchoolChange = (val: string) => {
    setSelectedSchoolId(val);
    setErrors((e) => ({ ...e, school: undefined }));
    // Classes from the previous school no longer apply.
    setSelectedClassIds([]);
  };

  const handleClassesChange = (vals: string[]) => {
    setSelectedClassIds(vals);
    setErrors((e) => ({ ...e, class: undefined }));
    // Prefill the date range from the first selected class (a sensible default;
    // the single date range is applied to every selected class).
    const first = classList.find((c: Class) => c.id === vals[0]) ?? null;
    if (first) {
      setStartDate(toInputDate(first.start_date));
      setEndDateVal(toInputDate(first.end_date));
      setDueDateVal("");
    }
  };

  // Resolve the real school_id for the currently selected school option.
  const resolvedSchoolId = (): string | undefined => {
    if (!selectedSchoolId || selectedSchoolId === NO_SCHOOL_KEY) return undefined;
    // The option value is the id when the school has one (educator schools /
    // classes keyed by id); fall back to a class lookup for name-keyed options.
    const byClass = classList.find(
      (c: Class) => schoolKeyOf(c) === selectedSchoolId,
    );
    return byClass?.school_id || selectedSchoolId;
  };

  const handleCreateClass = async () => {
    if (!newClass) return;
    const name = newClass.name.trim();
    if (!name) {
      setNewClassError("Enter a class name.");
      return;
    }
    if (!newClass.start || !newClass.end) {
      setNewClassError("Enter the class start and end dates.");
      return;
    }
    if (dayjs(newClass.end).isBefore(dayjs(newClass.start), "day")) {
      setNewClassError("End date must be on or after the start date.");
      return;
    }
    if (!newClass.status) {
      setNewClassError("Select a class status.");
      return;
    }
    setCreatingClass(true);
    setNewClassError(null);
    try {
      const studentsNum = Number(newClass.students);
      const payload: PostClassPayload = {
        school_id: resolvedSchoolId(),
        class_name: name,
        start_date: newClass.start,
        end_date: newClass.end,
        status: newClass.status as PostClassPayload["status"],
        user_id: (getParsedUser()?.id as string | undefined) ?? undefined,
      };
      if (newClass.students.trim() && Number.isFinite(studentsNum) && studentsNum > 0) {
        payload.total_no_of_students = studentsNum;
      }
      const res = await dispatch(PostClassRequest(payload)).unwrap();
      const newId = res?.data?.id;
      await dispatch(FetchClassesRequest()).unwrap();
      if (newId) {
        setSelectedClassIds((prev) =>
          prev.includes(newId) ? prev : [...prev, newId],
        );
        setStartDate(toInputDate(newClass.start));
        setEndDateVal(toInputDate(newClass.end));
        setErrors((e) => ({ ...e, class: undefined }));
      }
      setNewClass(null);
      sonnerToast.success(res?.message || "Class created");
    } catch (err: unknown) {
      setNewClassError(
        (err as { message?: string })?.message ?? "Failed to create class",
      );
    } finally {
      setCreatingClass(false);
    }
  };

  const handleSubmit = async () => {
    const newErrors: typeof errors = {};
    if (!selectedSchoolId) newErrors.school = "Please select a school.";
    if (selectedClassIds.length === 0)
      newErrors.class = t.errClassRequired;
    if (!selectedUnit && selectedSimulations.length === 0)
      newErrors.unit = t.errSimRequired;
    if (!startDate) newErrors.startDate = t.errStartRequired;
    if (!dueDateVal) newErrors.dueDate = t.errDueRequired;
    if (!endDateVal) newErrors.endDate = t.errEndRequired;
    if (startDate && dueDateVal && endDateVal) {
      const due = dayjs(dueDateVal);
      const start = dayjs(startDate);
      const end = dayjs(endDateVal);
      if (due.isBefore(start, "day") || due.isAfter(end, "day")) {
        newErrors.dueDate = t.errDueDateRange;
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    // Assign every selected simulation to every selected class (one date range
    // applied to all).
    const targetClassIds = selectedClassIds;
    try {
      let lastMessage = "";
      for (const cid of targetClassIds) {
        const cls = classList.find((c: Class) => c.id === cid) ?? null;
        const reduceToken =
          cls?.students?.length ||
          (cid === classId ? students.length : 0);
        for (const sim of selectedSimulations) {
          const response = await dispatch(
            addSimulationRequest({
              class_id: cid,
              simulation_id: sim.id,
              start_date: toMMDDYYYY(startDate),
              due_date: toMMDDYYYY(dueDateVal),
              end_date: toMMDDYYYY(endDateVal),
              reduceToken: isAISimulation(
                (sim as unknown as Record<string, unknown>)?.avatarEnabled as
                  | boolean
                  | undefined,
              )
                ? reduceToken
                : 0,
            }),
          ).unwrap();
          lastMessage = response?.message || "Simulation added successfully";
        }
      }

      sonnerToast.success(lastMessage);
      await onAssigned?.();
      onClose();

      void dispatch(fetchMyLibrarySimulations());
      void dispatch(FetchClassesRequest({ silent: true }));
      void dispatch(clearAddSimulationState());
      setTimeout(() => {
        void dispatch(fetchNotifications());
      }, 800);
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast.error(err?.message ?? "Something went wrong");
    }
  };

  const activeClasses = classList.filter(
    (c: Class) => c.status?.toUpperCase() !== "ARCHIEVED",
  );

  // School selector options — the educator's own schools (authoritative ids, so
  // a class can be created even for a school with no classes yet) merged with any
  // distinct schools across their active classes. Defaults to the only school.
  const schoolOptions = (() => {
    const map = new Map<string, string>();
    const userSchools =
      (getParsedUser()?.schools as
        | Array<{ id?: string; school_name?: string }>
        | undefined) ?? [];
    for (const s of userSchools) {
      if (s.id) map.set(s.id, s.school_name || s.id);
    }
    for (const c of activeClasses) {
      const key = schoolKeyOf(c);
      if (!map.has(key))
        map.set(key, c.school_name || (key === NO_SCHOOL_KEY ? "No School" : key));
    }
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  })();

  // Classes shown in the Class Name selector, filtered by the chosen school.
  // Labels carry the associated school + start/end dates (details in-list).
  // A school must be chosen first; the class list is then scoped to it, so the
  // school is inferred and no longer shown on each class row.
  const classOptions = activeClasses
    .filter((c: Class) => !!selectedSchoolId && schoolKeyOf(c) === selectedSchoolId)
    .map((c: Class) => ({
      value: c.id,
      label: c.class_name,
      subLabels: [`${fmtClassDate(c.start_date)} – ${fmtClassDate(c.end_date)}`],
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Modality/audience of a scenario, for the two pre-filters.
  const scenarioModality = (s: UnitSimulation) =>
    (s as unknown as Record<string, unknown>).avatarEnabled
      ? "Avatar"
      : "Workstation";
  const scenarioAudience = (s: UnitSimulation) => {
    const lvl = String(
      (s as unknown as Record<string, unknown>).learnerLevel ?? "",
    ).toLowerCase();
    if (/post[-\s]?secondary/.test(lvl)) return "Post-Secondary";
    if (/secondary|high school/.test(lvl)) return "Secondary";
    return "";
  };
  const modalityOptions = [
    { value: "Avatar", label: "Avatar" },
    { value: "Workstation", label: "Workstation" },
  ];
  const audienceOptions = [
    { value: "Secondary", label: "Secondary" },
    { value: "Post-Secondary", label: "Post-Secondary" },
  ];
  const filteredScenarios = allScenarios.filter(
    (s) =>
      (!filterModality || scenarioModality(s) === filterModality) &&
      (!filterAudience || scenarioAudience(s) === filterAudience),
  );
  const simulationNameOptions = filteredScenarios
    .map((s) => ({
      label: s.title,
      value: s.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const today = dayjs().format("YYYY-MM-DD");

  const firstSelectedSim = selectedSimulations[0] ?? null;
  // Unit box shows the distinct unit name(s) across all selected simulations.
  const selectedSimValues = selectedSimulations.map((s) => s.id);

  // Avatar-seat guard: an avatar simulation can only be assigned if the educator
  // has an ACTIVE associated avatar product AND enough remaining seats on it.
  const seatWarning = (() => {
    const avatarSims = selectedSimulations.filter((s) =>
      isAISimulation(
        (s as unknown as Record<string, unknown>)?.avatarEnabled as
          | boolean
          | undefined,
      ),
    );
    if (avatarSims.length === 0 || selectedClassIds.length === 0) return null;
    const now = Date.now();
    const activeAvatarUnits = listProductUnits(
      (getParsedUser()?.subscriptions as Subscription[] | undefined) ?? [],
    ).filter((u) => {
      if (u.kind !== "online") return false;
      if (!u.licensedThrough) return true;
      const d = new Date(u.licensedThrough);
      return Number.isNaN(d.getTime()) || d.getTime() >= now;
    });
    if (activeAvatarUnits.length === 0) {
      return "You have no active associated avatar products, so avatar simulations can't be assigned. Ask your administrator to associate an avatar product with your account.";
    }
    const remainingSeats = activeAvatarUnits.reduce(
      (sum, u) => sum + Math.max(0, (u.seatsTotal ?? 0) - (u.seatsConsumed ?? 0)),
      0,
    );
    const studentsAcross = selectedClassIds.reduce((sum, cid) => {
      const cls = classList.find((c: Class) => c.id === cid) ?? null;
      return (
        sum +
        (cls?.students?.length || (cid === classId ? students.length : 0))
      );
    }, 0);
    const neededSeats = avatarSims.length * studentsAcross;
    if (neededSeats > remainingSeats) {
      return `You have an insufficient number of remaining avatar seats for the required product (${remainingSeats} remaining, ${neededSeats} needed for this assignment).`;
    }
    return null;
  })();

  const dateFields: {
    label: string;
    value: string;
    setter: React.Dispatch<React.SetStateAction<string>>;
    error?: string;
    errorKey: "startDate" | "dueDate" | "endDate";
  }[] = [
      {
        label: t.fieldStartDate,
        value: startDate,
        setter: setStartDate,
        error: errors.startDate,
        errorKey: "startDate",
      },
      {
        label: t.fieldDueDate,
        value: dueDateVal,
        setter: setDueDateVal,
        error: errors.dueDate,
        errorKey: "dueDate",
      },
      {
        label: t.fieldEndDate,
        value: endDateVal,
        setter: setEndDateVal,
        error: errors.endDate,
        errorKey: "endDate",
      },
    ];

  const calendarIcon = (
    <svg
      className="w-3.5 h-3.5 text-gray-500 pointer-events-none"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );

  const footer = (
    <div className="flex gap-3">
      <Button
        type="button"
        variant="secondary"
        onClick={onClose}
        className="w-1/2 h-11 rounded-full"
      >
        {t.back}
      </Button>
      <Button
        variant="default"
        className="w-1/2 h-11 rounded-full bg-gradient-btn text-white hover:opacity-90 transition-opacity disabled:opacity-60"
        onClick={() => {
          if (seatWarning) {
            toast.error(seatWarning);
          } else if (
            selectedSimulations.length > 0 &&
            simulations?.some(
              (simulation) =>
                simulation.simulation_id === selectedSimulations[0].simulation_id &&
                simulation.end_date &&
                new Date(simulation.end_date) > new Date()
            )
          ) {
            toast.error(t.warningMessage)
          } else if (
            selectedSimulations.length > 0 &&
            simulations?.some(
              (simulation) =>
                simulation.simulation_id === selectedSimulations[0].simulation_id
            )
          ) {
            setShowConfirm(true);
          } else {
            handleSubmit();
          }
        }}
        loading={isLoading}
        disabled={isLoading || !!seatWarning}
        loadingText={t.adding}
      >
        {t.createAssignment}
      </Button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.title}
      footer={footer}
      className="max-w-3xl w-full"
    >
      <ConfirmModal
        isOpen={showConfirm}
        title={t.confirmTitle}
        message={t.confirmMessage}
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirm(false)}
        cancelText={t.cancel}
        confirmText={t.confirm}
      />
      {seatWarning && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle
            size={18}
            className="flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <span>{seatWarning}</span>
        </div>
      )}
      {showClassFields && (
        <>
          {schoolOptions.length > 0 && (
            <div className="mb-4">
              <SelectField
                label="School"
                required
                options={schoolOptions}
                value={selectedSchoolId}
                placeholder="Select School"
                onChange={handleSchoolChange}
                error={errors.school}
              />
            </div>
          )}
          <div className="mb-4">
            <MultiSelect
              label={t.fieldClassName}
              required
              searchable
              summarize
              disabled={!selectedSchoolId}
              options={classOptions}
              values={selectedClassIds}
              placeholder={
                !selectedSchoolId
                  ? "Select a school first"
                  : classesLoading
                    ? t.placeholderLoadingClasses
                    : t.placeholderSelectClass
              }
              onChange={handleClassesChange}
              onCreate={
                selectedSchoolId
                  ? async (name: string) => {
                      // Open the inline "New Class" form pre-filled with the typed
                      // name; actual creation happens from that form (a class needs
                      // dates), so return null here (nothing to auto-select yet).
                      setNewClass({
                        name: name.trim(),
                        start: startDate || "",
                        end: endDateVal || "",
                        students: "",
                        status: "",
                      });
                      setNewClassError(null);
                      return null;
                    }
                  : undefined
              }
              createLabel={(name: string) => `Create class "${name}"`}
            />
            {errors.class && (
              <p className="text-[10px] text-red-500 mt-0.5">{errors.class}</p>
            )}
          </div>

          {newClass && (
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-primary-600 mb-3">
                Create a new class
              </p>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  School
                </label>
                <div className="w-full h-[38px] px-3 rounded-xl border-2 border-gray-200 bg-gray-100 text-sm text-gray-600 flex items-center">
                  {schoolOptions.find((s) => s.value === selectedSchoolId)
                    ?.label || "—"}
                </div>
              </div>
              <div className="mb-3">
                <label
                  htmlFor="new-class-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Class Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="new-class-name"
                  type="text"
                  value={newClass.name}
                  onChange={(e) =>
                    setNewClass((c) => (c ? { ...c, name: e.target.value } : c))
                  }
                  placeholder="Enter class name"
                  className="w-full h-[38px] px-3 rounded-xl border-2 border-gray-300 text-sm focus:outline-none focus:border-primary-400"
                />
              </div>
              <div className="mb-3">
                <SelectField
                  label="Class Status"
                  required
                  options={[
                    { value: "ACTIVE", label: "Active" },
                    { value: "DRAFT", label: "Draft" },
                    { value: "INACTIVE", label: "Inactive" },
                    { value: "ARCHIEVED", label: "Archived" },
                  ]}
                  value={newClass.status}
                  placeholder="Select Class Status"
                  onChange={(val: string) =>
                    setNewClass((c) => (c ? { ...c, status: val } : c))
                  }
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-1">
                <div>
                  <label
                    htmlFor="new-class-start"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="new-class-start"
                    type="date"
                    value={newClass.start}
                    max={newClass.end || undefined}
                    onChange={(e) =>
                      setNewClass((c) =>
                        c ? { ...c, start: e.target.value } : c,
                      )
                    }
                    className="w-full h-[38px] px-2 rounded-xl border-2 border-gray-300 text-sm focus:outline-none focus:border-primary-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-class-end"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="new-class-end"
                    type="date"
                    value={newClass.end}
                    min={newClass.start || undefined}
                    onChange={(e) =>
                      setNewClass((c) => (c ? { ...c, end: e.target.value } : c))
                    }
                    className="w-full h-[38px] px-2 rounded-xl border-2 border-gray-300 text-sm focus:outline-none focus:border-primary-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-class-students"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    # Students{" "}
                    <span className="text-gray-500 font-normal">(optional)</span>
                  </label>
                  <input
                    id="new-class-students"
                    type="number"
                    min={0}
                    value={newClass.students}
                    onChange={(e) =>
                      setNewClass((c) =>
                        c ? { ...c, students: e.target.value } : c,
                      )
                    }
                    placeholder="e.g. 24"
                    className="w-full h-[38px] px-3 rounded-xl border-2 border-gray-300 text-sm focus:outline-none focus:border-primary-400"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Leave # Students blank if you&rsquo;re not sure — you can add
                students later from Class Management.
              </p>
              {newClassError && (
                <p className="text-[11px] text-red-500 mb-2">{newClassError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="gradient"
                  className="h-10 px-5"
                  onClick={handleCreateClass}
                  loading={creatingClass}
                  disabled={creatingClass}
                  loadingText="Creating…"
                >
                  Create Class
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 px-5"
                  onClick={() => {
                    setNewClass(null);
                    setNewClassError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Pre-filters (first on the form): modality + audience narrow the
          Simulation Name list below. */}
      <div className="mb-4">
        <SelectField
          label={t.fieldProductCategory}
          options={modalityOptions}
          value={filterModality}
          placeholder="Select Simulation Modality"
          onChange={(val: string) => {
            setFilterModality(val);
            setSelectedSimulations([]);
            setSelectedUnit(null);
            setLoadedUnitId("");
          }}
        />
      </div>

      <div className="mb-4">
        <SelectField
          label="Learner Level"
          options={audienceOptions}
          value={filterAudience}
          placeholder="Select Learner Level"
          onChange={(val: string) => {
            setFilterAudience(val);
            setSelectedSimulations([]);
            setSelectedUnit(null);
            setLoadedUnitId("");
          }}
        />
      </div>

      <div className="mb-4">
        <MultiSelect
          label={t.fieldSimName}
          required
          searchable
          summarize
          options={simulationNameOptions}
          values={selectedSimValues}
          placeholder={
            allScenariosLoading
              ? t.placeholderLoadingSims
              : t.placeholderSelectSim
          }
          onChange={handleSimulationsChange}
          disabled={allScenariosLoading}
        />
        {errors.unit && (
          <p className="text-[10px] text-red-500 mt-0.5">{errors.unit}</p>
        )}
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {t.fieldDuration}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {dateFields.map((item) => (
            <div key={item.label} className="date-input-group">
              <p className="text-sm text-gray-700 font-medium mb-1">
                {item.label} <span className="text-red-500">*</span>
              </p>
              <div className="relative">
                <Input
                  type="text"
                  readOnly
                  tabIndex={0}
                  placeholder="MM-DD-YYYY"
                  value={
                    item.value ? dayjs(item.value).format("MM-DD-YYYY") : ""
                  }
                  onClick={(e) => {
                    const group = (e.currentTarget as HTMLElement).closest(
                      ".date-input-group",
                    );
                    (
                      group?.querySelector(
                        'input[type="date"]',
                      ) as HTMLInputElement
                    )?.showPicker?.();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const group = (e.currentTarget as HTMLElement).closest(
                        ".date-input-group",
                      );
                      (
                        group?.querySelector(
                          'input[type="date"]',
                        ) as HTMLInputElement
                      )?.showPicker?.();
                    }
                  }}
                  inputClassName="w-full h-[38px] rounded-xl border-2 border-gray-300 text-sm whitespace-nowrap placeholder:text-sm focus:outline-none focus:border-primary-400 cursor-pointer pl-2 pr-7"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                  {calendarIcon}
                </span>
              </div>
              <input
                type="date"
                value={item.value}
                min={
                  item.errorKey === "startDate"
                    ? today
                    : item.errorKey === "dueDate"
                      ? startDate || today
                      : item.errorKey === "endDate"
                        ? dueDateVal || startDate || today
                        : undefined
                }
                max={
                  item.errorKey === "startDate"
                    ? endDateVal || undefined
                    : item.errorKey === "dueDate"
                      ? endDateVal
                      : undefined
                }
                tabIndex={-1}
                onChange={(e) => {
                  const newVal = e.target.value;
                  item.setter(newVal);
                  if (item.errorKey === "startDate") {
                    if (dueDateVal && newVal > dueDateVal) setDueDateVal("");
                    if (endDateVal && newVal > endDateVal) setEndDateVal("");
                  } else if (item.errorKey === "endDate") {
                    if (dueDateVal && newVal < dueDateVal) setDueDateVal("");
                  }
                  setErrors((prev) => ({
                    ...prev,
                    [item.errorKey]: undefined,
                  }));
                }}
                className="sr-only"
              />
              {item.error && (
                <p className="text-[10px] text-red-500 mt-0.5">{item.error}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Selected-simulation info panel — only when exactly one sim is chosen
          (details are ambiguous across multiple simulations). */}
      {selectedSimulations.length === 1 &&
        firstSelectedSim &&
        (() => {
          const raw = firstSelectedSim as unknown as Record<string, unknown>;
          const rows: { label: string; value: string }[] = [];
          const add = (label: string, value: unknown) => {
            const v = Array.isArray(value)
              ? value.filter(Boolean).join("; ")
              : String(value ?? "");
            if (v.trim()) rows.push({ label, value: v });
          };
          add("Difficulty", raw["difficulty"]);
          add("Duration", raw["duration"] ?? raw["estimatedDuration"]);
          add(
            "Clinical Setting",
            raw["department"] ?? raw["clinicalLocation"] ?? raw["clinicalSetting"],
          );
          add("Description", raw["description"]);
          add(
            "Learning Objectives",
            raw["learning_objectives"] ?? raw["learningObjectives"],
          );
          if (rows.length === 0) return null;
          return (
            <div className="mb-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-primary-600 mb-2">
                Simulation Details
              </p>
              <dl className="space-y-2">
                {rows.map((r) => (
                  <div key={r.label}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {r.label}
                    </dt>
                    <dd className="text-sm text-gray-700 whitespace-pre-line">
                      {r.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })()}
    </Modal>
  );
};

export default AddSimulationModal;
