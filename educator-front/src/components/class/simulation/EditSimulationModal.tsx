import { AlertCircle, Calendar, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import loginEn from "../../../locales/auth/login/en.json";
import loginEs from "../../../locales/auth/login/es.json";
import { toast } from "../../common/Toast";
import {
  clearUpdateSimulationState,
  selectUpdateSimError,
  selectUpdateSimLoading,
  selectUpdateSimSuccess,
  selectUpdateSimResponse,
  updateSimulationRequest,
} from "../../../redux/class/UpdateSimRedux";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import type { SimulationItem } from "../../../types/index";
import Modal from "../../ui/Modal";
import Input from "../../ui/Input";
import { Button } from "../../ui/Button";
import { getDerivedCategory } from "../../../utils/simulationType";

interface Props {
  sim: SimulationItem;
  classId: string;
  className?: string;
  onClose: () => void;
}

const toInputDate = (date: string): string => {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return "";
  if (parts[0].length === 4) return date;
  return `${parts[2]}-${parts[0]}-${parts[1]}`;
};

export default function EditSimulationModal({ sim, onClose }: Props) {
  const dispatch = useAppDispatch();
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).editSimModal;
  const isLoading = useAppSelector(selectUpdateSimLoading);
  const isSuccess = useAppSelector(selectUpdateSimSuccess);
  const apiError = useAppSelector(selectUpdateSimError);
  const apiResponse = useAppSelector(selectUpdateSimResponse);
  const originalStart = toInputDate(sim.start_date);
  const originalEnd = toInputDate(sim.end_date);
  const [startDate, setStartDate] = useState(originalStart);
  const [dueDate, setDueDate] = useState(toInputDate(sim.due_date));
  const [closeDate, setCloseDate] = useState(originalEnd);

  useEffect(() => {
    setStartDate(toInputDate(sim.start_date));
    setDueDate(toInputDate(sim.due_date));
    setCloseDate(toInputDate(sim.end_date));
  }, [sim.id]);

  const startPickerRef = useRef<HTMLInputElement>(null);
  const duePickerRef = useRef<HTMLInputElement>(null);
  const closePickerRef = useRef<HTMLInputElement>(null);

  const toApiDate = (date: string): string => {
    if (!date) return "";
    const [year, month, day] = date.split("-");
    return `${month}-${day}-${year}`;
  };

  useEffect(() => {
    if (isSuccess) {
      toast.success(apiResponse?.message ?? t.successUpdate);
      setTimeout(async () => {
        await dispatch(clearUpdateSimulationState());
        onClose();
      }, 2000);
    }
  }, [isSuccess, apiResponse, dispatch, onClose]);

  useEffect(() => {
    return () => {
      (async () => {
        await dispatch(clearUpdateSimulationState());
      })();
    };
  }, [dispatch]);

  const hasChanges =
    startDate !== originalStart ||
    dueDate !== toInputDate(sim.due_date) ||
    closeDate !== originalEnd;

  const handleSave = async () => {
    if (!hasChanges) {
      toast.error(t.noChanges);
      return;
    }
    await dispatch(
      updateSimulationRequest({
        simId: sim.id,
        start_date: toApiDate(startDate),
        due_date: toApiDate(dueDate),
        end_date: toApiDate(closeDate),
      }),
    );
  };

  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !isLoading) {
        e.preventDefault();
        void handleSaveRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isLoading]);

  return (
    <>
      <Modal
        isOpen={true}
        onClose={() => {
          if (!isLoading) onClose();
        }}
        title={t.title}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!isLoading) onClose();
              }}
              disabled={isLoading}
              className="w-full h-11 rounded-full"
            >
              {t.back}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="w-full h-11 rounded-full bg-primary-500 text-white disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> {t.saving}
                </>
              ) : (
                t.saveChanges
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {apiError && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-600">{apiError}</p>
            </div>
          )}

          <Input
            label={t.fieldSimName}
            value={sim.simulation_title}
            readOnly
            inputClassName="bg-gray-50 text-gray-600 cursor-not-allowed"
          />

          <Input
            label={t.fieldUnit}
            value={sim.unit_name ?? sim.unit ?? sim.simulation_lib_name ?? ""}
            readOnly
            inputClassName="bg-gray-50 text-gray-600 cursor-not-allowed"
          />

          <Input
            label={t.fieldProductCategory}
            value={
              getDerivedCategory(
                (sim as unknown as Record<string, unknown>)?.avatarEnabled as
                | boolean
                | undefined,
              ) || ""
            }
            readOnly
            inputClassName="bg-gray-50 text-gray-600 cursor-not-allowed"
          />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-gray-500 font-medium mb-1">
                {t.fieldStartDate} <span className="text-red-500">*</span>
              </p>
              <div className="relative">
                <Input
                  placeholder="MM-DD-YYYY"
                  value={startDate ? dayjs(startDate).format("MM-DD-YYYY") : ""}
                  onClick={() =>
                    !isLoading && startPickerRef.current?.showPicker?.()
                  }
                  inputClassName={`pr-8 ${isLoading ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "cursor-pointer"}`}
                />
                <Calendar
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
              </div>
              <Input
                ref={startPickerRef}
                type="date"
                value={startDate}
                min={originalStart || undefined}
                max={originalEnd || undefined}
                disabled={isLoading}
                onChange={(e) => {
                  const newVal = e.target.value;
                  setStartDate(newVal);
                  if (closeDate && newVal && newVal > closeDate) {
                    setCloseDate("");
                    setDueDate("");
                  } else if (dueDate && newVal && newVal > dueDate) {
                    setDueDate("");
                  }
                }}
                className="sr-only"
              />
              {!startDate && (
                <p className="text-[10px] text-red-500 mt-0.5">
                  {t.errStartRequired}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs text-gray-500 font-medium mb-1">
                {t.fieldDueDate} <span className="text-red-500">*</span>
              </p>
              <div className="relative">
                <Input
                  placeholder="MM-DD-YYYY"
                  value={dueDate ? dayjs(dueDate).format("MM-DD-YYYY") : ""}
                  readOnly
                  onClick={() =>
                    !isLoading && duePickerRef.current?.showPicker?.()
                  }
                  inputClassName={`pr-8 ${isLoading ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "cursor-pointer"}`}
                />
                <Calendar
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
              </div>
              <Input
                ref={duePickerRef}
                type="date"
                value={dueDate}
                min={startDate || originalStart || undefined}
                max={closeDate || originalEnd || undefined}
                disabled={isLoading}
                onChange={(e) => {
                  const newVal = e.target.value;
                  setDueDate(newVal);
                  if (closeDate && newVal && newVal > closeDate) {
                    setCloseDate("");
                  }
                }}
                className="sr-only"
              />
              {!dueDate && (
                <p className="text-[10px] text-red-500 mt-0.5">
                  {t.errDueRequired}
                </p>
              )}
            </div>

            <div>
              <p className="text-xs text-gray-500 font-medium mb-1">
                {t.fieldCloseDate} <span className="text-red-500">*</span>
              </p>
              <div className="relative">
                <Input
                  placeholder="MM-DD-YYYY"
                  value={closeDate ? dayjs(closeDate).format("MM-DD-YYYY") : ""}
                  onClick={() =>
                    !isLoading && closePickerRef.current?.showPicker?.()
                  }
                  inputClassName={`pr-8 ${isLoading ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "cursor-pointer"}`}
                />
                <Calendar
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
              </div>
              <Input
                ref={closePickerRef}
                type="date"
                value={closeDate}
                min={dueDate || startDate || originalStart || undefined}
                max={originalEnd || undefined}
                disabled={isLoading}
                onChange={(e) => {
                  const newVal = e.target.value;
                  setCloseDate(newVal);
                  if (dueDate && newVal && dueDate > newVal) {
                    setDueDate("");
                  }
                }}
                className="sr-only"
              />
              {!closeDate && (
                <p className="text-[10px] text-red-500 mt-0.5">
                  {t.errCloseRequired}
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
