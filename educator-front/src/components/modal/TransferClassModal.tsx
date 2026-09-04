import { useState, useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { ArrowRight, ArrowLeft, ArrowRightLeft, CheckCircle2, Loader2, AlertCircle, ShieldCheck, Users } from 'lucide-react';
import Modal from '../ui/Modal';
import SelectField from '../ui/Select';
import { Button } from '../ui/Button';
import StatusPill, { type StatusTone } from '../common/StatusPill';
import { getEffectiveClassStatus } from '../../utils/classUtils';
import { getStatusLabel } from '../../types/Class_types';
import { TransferClassRequest, resetTransferState } from '../../redux/class/TransferClassRedux';
import { GetEducatorByUserRequest } from '../../redux/educator/GetEducatorRedux';
import type { AppDispatch } from '../../store';
import type { Educator } from '../../types';
import type { ClassWithStudents } from '../../types/Class_types';


type Step = 'select-class' | 'select-target' | 'review' | 'loading' | 'success';

interface TransferClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceEducator: Educator;
  sourceClasses: ClassWithStudents[];
  isLoadingClasses: boolean;
  allActiveEducators: Educator[];
}


const STEPS = ['Select Class', 'Select Educator', 'Review & Confirm'] as const;

/** Format a class open/close date, tolerating ISO strings and missing values. */
const fmtClassDate = (s?: string) => {
  if (!s) return '—';
  const d = new Date(s.split('T')[0]);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const classStudentCount = (c: ClassWithStudents) =>
  c.total_no_of_students ?? (c.students ?? []).length;

const statusToneFor = (s: string): StatusTone =>
  s === 'ACTIVE' ? 'success' : s === 'ATTENTION' ? 'warning' : s === 'DRAFT' ? 'neutral' : 'danger';


function StepProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center w-full mb-6">
      {STEPS.map((label, i) => {
        const num = i + 1;
        const active = num === current;
        const done = num < current;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                  ${active ? 'bg-primary-500 text-white shadow-[0_4px_12px_rgba(219,136,51,0.4)]' : done ? 'bg-[#5f6060] text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                {num}
              </div>
              <span className={`text-sm font-medium whitespace-nowrap ${active ? 'text-primary-500' : 'text-gray-500'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-2 mb-4 transition-colors ${done ? 'bg-primary-300' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}


/** Summary card of the classes chosen for transfer (steps 2 & 3). */
function SelectedClassesSummary({
  classes,
  onRemove,
}: {
  classes: ClassWithStudents[];
  onRemove?: (id: string) => void;
}) {
  if (classes.length === 0) return null;
  const totalStudents = classes.reduce((t, c) => t + classStudentCount(c), 0);
  return (
    <div className="rounded-2xl border-2 border-primary-500 bg-white px-5 py-4">
      <p className="text-sm font-semibold text-gray-700 mb-2.5">
        Selected Class{classes.length !== 1 ? 'es' : ''} ({classes.length})
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {classes.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 bg-[#e9e9e9] text-[#5f6060] border border-gray-300 rounded-full px-3 py-1 text-sm"
          >
            {c.class_name}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(c.id)}
                className="text-gray-500 hover:text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 rounded"
                aria-label={`Remove ${c.class_name}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-sm text-gray-600">
        <Users size={15} className="text-primary-500" />
        {totalStudents} student{totalStudents !== 1 ? 's' : ''} across {classes.length} class{classes.length !== 1 ? 'es' : ''}
      </p>
    </div>
  );
}


export default function TransferClassModal({
  isOpen,
  onClose,
  sourceEducator,
  sourceClasses,
  isLoadingClasses,
  allActiveEducators,
}: TransferClassModalProps) {
  const dispatch = useDispatch<AppDispatch>();

  const [step, setStep] = useState<Step>('select-class');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [classSearch, setClassSearch] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    count: number;
    targetName: string;
  } | null>(null);


  const targetEducatorOptions = useMemo(
    () =>
      allActiveEducators
        .filter((e) => e.id !== sourceEducator.id)
        .map((e) => ({
          value: e.id,
          label: e.full_name ?? e.email ?? e.id,
        })),
    [allActiveEducators, sourceEducator.id],
  );

  const filteredClasses = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    return q
      ? sourceClasses.filter((c) => c.class_name.toLowerCase().includes(q))
      : sourceClasses;
  }, [sourceClasses, classSearch]);

  const selectedClasses = useMemo(
    () => sourceClasses.filter((c) => selectedClassIds.includes(c.id)),
    [sourceClasses, selectedClassIds],
  );

  const selectedTarget = useMemo(
    () => allActiveEducators.find((e) => e.id === selectedTargetId) ?? null,
    [allActiveEducators, selectedTargetId],
  );

  const toggleClass = (id: string) =>
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const selectAllVisible = () =>
    setSelectedClassIds((prev) =>
      Array.from(new Set([...prev, ...filteredClasses.map((c) => c.id)])),
    );
  const clearAllClasses = () => setSelectedClassIds([]);


  const handleClose = useCallback(() => {
    setStep('select-class');
    setSelectedClassIds([]);
    setClassSearch('');
    setSelectedTargetId('');
    setApiError(null);
    setSuccessData(null);
    dispatch(resetTransferState());
    onClose();
  }, [dispatch, onClose]);

  const handleNext = useCallback(() => {
    if (step === 'select-class' && selectedClassIds.length > 0) setStep('select-target');
    else if (step === 'select-target' && selectedTargetId) setStep('review');
  }, [step, selectedClassIds, selectedTargetId]);

  const handleBack = useCallback(() => {
    if (step === 'select-target') setStep('select-class');
    else if (step === 'review') setStep('select-target');
  }, [step]);

  const handleConfirm = useCallback(async () => {
    if (selectedClassIds.length === 0 || !selectedTargetId) return;
    setStep('loading');
    setApiError(null);

    // The API transfers one class at a time; fan out and aggregate the results.
    const results = await Promise.allSettled(
      selectedClassIds.map((id) =>
        dispatch(
          TransferClassRequest({ classId: id, targetEducatorId: selectedTargetId }),
        ).unwrap(),
      ),
    );

    void dispatch(GetEducatorByUserRequest());

    const failed = results.filter((r) => r.status === 'rejected');
    const succeeded = results.length - failed.length;

    if (failed.length === 0) {
      setSuccessData({
        count: succeeded,
        targetName:
          selectedTarget?.full_name ?? selectedTarget?.email ?? 'the target educator',
      });
      setStep('success');
    } else {
      const first = failed[0] as PromiseRejectedResult;
      const reason = first.reason;
      const msg =
        typeof reason === 'string'
          ? reason
          : (reason as { message?: string })?.message ?? 'Transfer failed';
      setApiError(
        `${succeeded} of ${selectedClassIds.length} classes transferred. ${failed.length} failed: ${msg}`,
      );
      setStep('review');
    }
  }, [dispatch, selectedClassIds, selectedTargetId, selectedTarget]);


  const sourceName = sourceEducator.full_name ?? sourceEducator.email ?? 'Source Educator';
  const targetName = selectedTarget?.full_name ?? selectedTarget?.email ?? '';

  const renderBody = () => {
    if (step === 'select-class') {
      return (
        <div>
          <StepProgress current={1} />
          <div className="space-y-4">
            <div className="rounded-xl bg-[#e9e9e9] border border-gray-200 px-4 py-2.5 text-sm text-gray-700">
              <span className="text-[#5f6060] text-sm font-medium">Source Educator  </span>
              <span className="font-semibold text-gray-800">{sourceName}</span>
            </div>

            {isLoadingClasses ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
                <Loader2 size={15} className="animate-spin text-primary-400" />
                Loading classes…
              </div>
            ) : sourceClasses.length === 0 ? (
              <p className="text-sm text-gray-500 flex items-center gap-1.5">
                <AlertCircle size={14} />
                This educator has no classes to transfer.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Select Class{sourceClasses.length !== 1 ? 'es' : ''}{' '}
                  <span className="text-red-500">*</span>
                </label>
                <div className="rounded-xl border-2 border-gray-300 overflow-hidden">
                  {/* Search */}
                  <div className="p-2 border-b border-gray-100">
                    <input
                      type="text"
                      value={classSearch}
                      onChange={(e) => setClassSearch(e.target.value)}
                      placeholder="Search classes…"
                      aria-label="Search classes"
                      className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-primary-400"
                    />
                  </div>
                  {/* Select all / clear */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
                    <span className="text-gray-500">
                      {selectedClassIds.length} of {sourceClasses.length} selected
                    </span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={selectAllVisible}
                        className="text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={clearAllClasses}
                        className="text-gray-500 hover:text-black font-medium"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>
                  {/* List */}
                  <div
                    role="listbox"
                    aria-multiselectable="true"
                    aria-label="Classes"
                    className="max-h-72 overflow-y-auto divide-y divide-gray-100"
                  >
                    {filteredClasses.length > 0 ? (
                      filteredClasses.map((c) => {
                        const checked = selectedClassIds.includes(c.id);
                        const eff = getEffectiveClassStatus(
                          c.status,
                          c.start_date,
                          c.end_date,
                        );
                        const count = classStudentCount(c);
                        return (
                          <div
                            key={c.id}
                            role="option"
                            aria-selected={checked}
                            onClick={() => toggleClass(c.id)}
                            className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                              checked ? 'bg-[#e9e9e9]' : 'hover:bg-[#e9e9e9]'
                            }`}
                          >
                            <span
                              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                checked
                                  ? 'bg-primary-500 border-primary-500 text-white'
                                  : 'border-gray-300 bg-white'
                              }`}
                            >
                              {checked && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <path d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-800 break-words">
                                  {c.class_name}
                                </span>
                                <StatusPill label={getStatusLabel(eff)} tone={statusToneFor(eff)} />
                              </div>
                              {c.school_name && (
                                <p className="text-xs text-gray-500 mt-0.5 break-words">{c.school_name}</p>
                              )}
                              <div className="mt-0.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs text-gray-500 tabular-nums">
                                <span className="inline-flex items-center gap-1">
                                  <Users size={12} />
                                  {count} student{count !== 1 ? 's' : ''}
                                </span>
                                <span>Opens {fmtClassDate(c.start_date)}</span>
                                <span>Closes {fmtClassDate(c.end_date)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-3 py-4 text-sm text-gray-500">
                        No classes match your search.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (step === 'select-target') {
      return (
        <div>
          <StepProgress current={2} />
          <div className="space-y-4">
            <SelectedClassesSummary classes={selectedClasses} onRemove={toggleClass} />
            <SelectField
              label="Transfer To"
              required
              searchable
              placeholder="Search educators..."
              options={targetEducatorOptions}
              value={selectedTargetId}
              onChange={setSelectedTargetId}
            />
            <p className="text-sm text-gray-600 flex items-center gap-1">
              <AlertCircle size={14} />
              Only active educators are shown.
            </p>
          </div>
        </div>
      );
    }

    if (step === 'review') {
      return (
        <div>
          <StepProgress current={3} />
          <div className="space-y-4">
            <SelectedClassesSummary classes={selectedClasses} onRemove={toggleClass} />

            {/* FROM → TO */}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center">
                {/* From */}
                <div className="flex-1 px-5 py-4">
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-2">From</p>
                  <div className="flex items-center gap-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{sourceName}</p>
                      <p className="text-sm text-gray-500">Current Educator</p>
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex-shrink-0 flex items-center justify-center w-10">
                  <div className="w-8 h-8 rounded-full bg-[#e9e9e9] border border-gray-200 flex items-center justify-center">
                    <ArrowRight size={14} className="text-primary-500" />
                  </div>
                </div>

                {/* To */}
                <div className="flex-1 px-5 py-4">
                  <p className="text-sm font-semibold text-[#5f6060] uppercase tracking-widest mb-2">To</p>
                  <div className="flex items-center gap-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#5f6060] truncate">{targetName}</p>
                      <p className="text-sm text-gray-500">New Educator</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              <CheckCircle2 size={17} className="text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-700 mb-0.5">What will remain unchanged</p>
                <p className="text-sm text-green-600 leading-relaxed">
                  All students, simulations, reports, progress, history, schedules, and class settings will remain intact. Only the class ownership will be updated.
                </p>
              </div>
            </div>

            {apiError && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (step === 'loading') {
      return (
        <div className="flex flex-col items-center justify-center py-14 gap-4 text-gray-600">
          <Loader2 size={36} className="animate-spin text-primary-500" />
          <p className="font-medium">
            Transferring {selectedClassIds.length} class{selectedClassIds.length !== 1 ? 'es' : ''}…
          </p>
          <p className="text-sm text-gray-500">Please do not close this window.</p>
        </div>
      );
    }

    if (step === 'success' && successData) {
      return (
        <div className="flex flex-col items-center text-center py-10 gap-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center shadow-[0_4px_16px_rgba(34,197,94,0.2)]">
            <CheckCircle2 size={32} className="text-green-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">Transfer Successful</h3>
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
              <span className="font-semibold text-gray-700">
                {successData.count} class{successData.count !== 1 ? 'es' : ''}
              </span>{' '}
              {successData.count !== 1 ? 'have' : 'has'} been transferred from{' '}
              <span className="font-medium">{sourceName}</span> to{' '}
              <span className="font-medium text-primary-600">{successData.targetName}</span>.
            </p>
          </div>
          <p className="text-sm text-gray-500">Both educators have been notified.</p>
        </div>
      );
    }

    return null;
  };


  const renderFooter = () => {
    if (step === 'loading') return null;

    if (step === 'success') {
      return (
        <div className="flex justify-end">
          <Button variant="gradient" className="h-11 px-8 rounded-full font-semibold" onClick={handleClose}>
            Done
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between w-full gap-3">
        <div>
          {(step === 'select-target' || step === 'review') && (
            <Button
              variant="outline"
              className="h-11 px-5 rounded-full flex items-center gap-2 text-gray-600 border-gray-300"
              onClick={handleBack}
            >
              <ArrowLeft size={14} />
              Back
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="h-11 px-5 rounded-full text-gray-600 border-gray-300"
            onClick={handleClose}
          >
            Cancel
          </Button>
          {step !== 'review' ? (
            <Button
              variant="gradient"
              className="h-11 px-5 rounded-full flex items-center gap-2 font-semibold disabled:opacity-40"
              onClick={handleNext}
              disabled={
                (step === 'select-class' && (selectedClassIds.length === 0 || isLoadingClasses)) ||
                (step === 'select-target' && !selectedTargetId)
              }
            >
              Next
              <ArrowRight size={14} />
            </Button>
          ) : (
            <Button
              variant="gradient"
              className="h-11 px-5 rounded-full flex items-center gap-2 font-semibold"
              onClick={() => void handleConfirm()}
            >
              <ShieldCheck size={15} />
              Confirm Transfer
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={step === 'loading' ? () => undefined : handleClose}
      title="Transfer Class"
      subtitle="Reassign class ownership to another educator."
      footer={renderFooter()}
      className="max-w-2xl"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-[#e9e9e9] flex items-center justify-center flex-shrink-0">
          <ArrowRightLeft size={18} className="text-primary-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900 leading-tight">Transfer Class</h2>
          <p className="text-sm text-gray-500">Reassign class ownership to another educator.</p>
        </div>
      </div>
      {renderBody()}
    </Modal>
  );
}
