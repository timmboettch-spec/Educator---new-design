import { useState, useCallback, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import {
  ArrowRight,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Modal from '../ui/Modal';
import SelectField from '../ui/Select';
import { Button } from '../ui/Button';
import {
  TransferClassRequest,
  resetTransferState,
} from '../../redux/class/TransferClassRedux';
import { GetEducatorByUserRequest } from '../../redux/educator/GetEducatorRedux';
import type { AppDispatch } from '../../store';
import type { Educator } from '../../types';
import type { ClassWithStudents } from '../../types/Class_types';
import loginEn from '../../locales/auth/login/en.json';
import loginEs from '../../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

type Step = 'select-class' | 'select-target' | 'review' | 'loading' | 'success';

interface TransferClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceEducator: Educator;
  sourceClasses: ClassWithStudents[];
  isLoadingClasses: boolean;
  allActiveEducators: Educator[];
}

function StepProgress({
  current,
  steps,
}: {
  current: 1 | 2 | 3;
  steps: [string, string, string];
}) {
  return (
    <div className="flex items-center w-full mb-6">
      {steps &&
        steps.map((label, i) => {
          const num = i + 1;
          const active = num === current;
          const done = num < current;
          return (
            <div
              key={label}
              className="flex items-center flex-1 last:flex-none"
            >
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors
                  ${active ? 'bg-orange-500 text-white shadow-[0_4px_12px_rgba(249,115,22,0.4)]' : done ? 'bg-orange-200 text-orange-500' : 'bg-gray-100 text-gray-400'}`}
                >
                  {num}
                </div>
                <span
                  className={`text-sm font-medium whitespace-nowrap ${active ? 'text-orange-500' : 'text-gray-400'}`}
                >
                  {label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-px flex-1 mx-2 mb-4 transition-colors ${done ? 'bg-orange-300' : 'bg-gray-200'}`}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

function ClassCard({
  cls,
  locale,
}: {
  cls: ClassWithStudents | null;
  locale: typeof loginEn.transferClassModal;
}) {
  if (!cls) return null;
  const studentCount = cls.total_no_of_students ?? (cls.students ?? []).length;
  const studentLabel = studentCount !== 1 ? locale.students : locale.student;
  return (
    <div className="rounded-2xl overflow-hidden bg-gradient-to-r from-orange-500 to-orange-400 px-5 py-4 flex items-center gap-4">
      {/* <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3L2 9l10 6 10-6-10-6zM2 17l10 6 10-6M2 13l10 6 10-6" />
        </svg>
      </div> */}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-orange-100 uppercase tracking-widest mb-0.5">
          {locale.selectedClass}
        </p>
        <p className="text-lg font-bold text-white truncate leading-tight">
          {cls.class_name}
        </p>
        {cls.school_name && (
          <p className="text-sm text-orange-100 truncate">{cls.school_name}</p>
        )}
        <p className="flex items-center gap-1 text-sm text-orange-100 mt-0.5">
          <Users size={14} />
          {studentCount} {studentLabel} {locale.enrolled}
        </p>
      </div>
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
  const language = getStoredLanguage();
  const locale = language === 'es' ? loginEs : loginEn;
  const transferLocale = locale.transferClassModal;

  const steps: [string, string, string] = [
    transferLocale.stepSelectClass,
    transferLocale.stepSelectEducator,
    transferLocale.stepReviewConfirm,
  ];

  const [step, setStep] = useState<Step>('select-class');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    className: string;
    targetName: string;
    transferredAt: string;
  } | null>(null);

  const classOptions = useMemo(
    () => sourceClasses.map((c) => ({ value: c.id, label: c.class_name })),
    [sourceClasses]
  );

  const targetEducatorOptions = useMemo(
    () =>
      allActiveEducators
        .filter((e) => e.id !== sourceEducator.id)
        .map((e) => ({
          value: e.id,
          label: e.full_name ?? e.email ?? e.id,
        })),
    [allActiveEducators, sourceEducator.id]
  );

  const selectedClass = useMemo(
    () => sourceClasses.find((c) => c.id === selectedClassId) ?? null,
    [sourceClasses, selectedClassId]
  );

  const selectedTarget = useMemo(
    () => allActiveEducators.find((e) => e.id === selectedTargetId) ?? null,
    [allActiveEducators, selectedTargetId]
  );

  const handleClose = useCallback(() => {
    setStep('select-class');
    setSelectedClassId('');
    setSelectedTargetId('');
    setApiError(null);
    setSuccessData(null);
    dispatch(resetTransferState());
    onClose();
  }, [dispatch, onClose]);

  const handleNext = useCallback(() => {
    if (step === 'select-class' && selectedClassId) setStep('select-target');
    else if (step === 'select-target' && selectedTargetId) setStep('review');
  }, [step, selectedClassId, selectedTargetId]);

  const handleBack = useCallback(() => {
    if (step === 'select-target') setStep('select-class');
    else if (step === 'review') setStep('select-target');
  }, [step]);

  const handleConfirm = useCallback(async () => {
    if (!selectedClassId || !selectedTargetId) return;
    setStep('loading');
    setApiError(null);

    try {
      const result = await dispatch(
        TransferClassRequest({
          classId: selectedClassId,
          targetEducatorId: selectedTargetId,
        })
      ).unwrap();

      setSuccessData({
        className: result.data.className,
        targetName:
          result.data.targetEducatorName ??
          selectedTarget?.full_name ??
          transferLocale.targetEducator,
        transferredAt: result.data.transferredAt,
      });

      void dispatch(GetEducatorByUserRequest());

      setStep('success');
    } catch (err: unknown) {
      const msg =
        typeof err === 'string'
          ? err
          : ((err as { message?: string })?.message ??
            transferLocale.transferFailed);
      setApiError(msg);
      setStep('review');
    }
  }, [
    dispatch,
    selectedClassId,
    selectedTargetId,
    selectedTarget,
    transferLocale,
  ]);

  const sourceName =
    sourceEducator.full_name ??
    sourceEducator.email ??
    transferLocale.sourceEducator;
  const targetName = selectedTarget?.full_name ?? selectedTarget?.email ?? '';

  const renderBody = () => {
    if (step === 'select-class') {
      return (
        <div>
          <StepProgress current={1} steps={steps} />
          <div className="space-y-4">
            <div className="rounded-xl bg-orange-50 border border-orange-100 px-4 py-2.5 text-sm text-gray-700">
              <span className="text-gray-400 text-sm">
                {transferLocale.sourceEducator}{' '}
              </span>
              <span className="font-semibold text-gray-800">{sourceName}</span>
            </div>

            {isLoadingClasses ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
                <Loader2 size={15} className="animate-spin text-orange-400" />
                {transferLocale.loadingClasses}
              </div>
            ) : (
              <>
                <SelectField
                  label={transferLocale.selectClassLabel}
                  required
                  searchable
                  placeholder={transferLocale.chooseClass}
                  options={classOptions}
                  value={selectedClassId}
                  onChange={setSelectedClassId}
                />
                {classOptions.length === 0 && (
                  <p className="text-sm text-gray-400 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    This educator has no active classes to transfer.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      );
    }

    if (step === 'select-target') {
      return (
        <div>
          <StepProgress steps={steps} current={2} />
          <div className="space-y-4">
            <ClassCard cls={selectedClass} locale={transferLocale} />
            <SelectField
              label={transferLocale.transferToLabel}
              required
              searchable
              placeholder={transferLocale.searchEducators}
              options={targetEducatorOptions}
              value={selectedTargetId}
              onChange={setSelectedTargetId}
            />
            <p className="text-sm text-gray-600 flex items-center gap-1">
              <AlertCircle size={14} />
              {transferLocale.onlyActiveEducators}
            </p>
          </div>
        </div>
      );
    }

    if (step === 'review') {
      // const sourceInitial = sourceName?.[0]?.toUpperCase() ?? 'S';
      // const targetInitial = targetName?.[0]?.toUpperCase() ?? 'T';
      return (
        <div>
          <StepProgress current={3} steps={steps} />
          <div className="space-y-4">
            <ClassCard cls={selectedClass} locale={transferLocale} />

            {/* FROM → TO */}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center">
                {/* From */}
                <div className="flex-1 px-5 py-4">
                  <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-2">
                    {transferLocale.from}
                  </p>
                  <div className="flex items-center gap-2.5">
                    {/* <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm flex-shrink-0">
                      {sourceInitial}
                    </div> */}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {sourceName}
                      </p>
                      <p className="text-sm text-gray-400">
                        {transferLocale.currentEducator}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="flex-shrink-0 flex items-center justify-center w-10">
                  <div className="w-8 h-8 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center">
                    <ArrowRight size={14} className="text-orange-500" />
                  </div>
                </div>

                {/* To */}
                <div className="flex-1 px-5 py-4">
                  <p className="text-sm font-semibold text-orange-400 uppercase tracking-widest mb-2">
                    {transferLocale.to}
                  </p>
                  <div className="flex items-center gap-2.5">
                    {/* <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm flex-shrink-0">
                      {targetInitial}
                    </div> */}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-orange-600 truncate">
                        {targetName}
                      </p>
                      <p className="text-sm text-gray-400">
                        {transferLocale.newEducator}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
              <CheckCircle2
                size={17}
                className="text-green-500 flex-shrink-0 mt-0.5"
              />
              <div>
                <p className="text-sm font-semibold text-green-700 mb-0.5">
                  {transferLocale.unchangedTitle}
                </p>
                <p className="text-sm text-green-600 leading-relaxed">
                  {transferLocale.unchangedDescription}
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
          <Loader2 size={36} className="animate-spin text-orange-500" />
          <p className="font-medium">{transferLocale.transferringClass}</p>
          <p className="text-sm text-gray-400">
            {transferLocale.doNotCloseWindow}
          </p>
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
            <h3 className="text-lg font-bold text-gray-800 mb-1">
              {transferLocale.transferSuccessful}
            </h3>
            <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
              <span className="font-semibold text-gray-700">
                {successData.className}
              </span>{' '}
              {transferLocale.transferredFrom}{' '}
              <span className="font-medium">{sourceName}</span>{' '}
              {transferLocale.transferredTo}{' '}
              <span className="font-medium text-orange-600">
                {successData.targetName}
              </span>
              .
            </p>
          </div>
          <p className="text-sm text-gray-400">
            {transferLocale.bothEducatorsNotified}
          </p>
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
          <Button
            variant="gradient"
            className="h-11 px-8 rounded-full font-semibold"
            onClick={handleClose}
          >
            {transferLocale.done}
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
              {transferLocale.back}
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="h-11 px-5 rounded-full text-gray-600 border-gray-300"
            onClick={handleClose}
          >
            {transferLocale.cancel}
          </Button>
          {step !== 'review' ? (
            <Button
              variant="gradient"
              className="h-11 px-5 rounded-full flex items-center gap-2 font-semibold disabled:opacity-40"
              onClick={handleNext}
              disabled={
                (step === 'select-class' &&
                  (!selectedClassId || isLoadingClasses)) ||
                (step === 'select-target' && !selectedTargetId)
              }
            >
              {transferLocale.next}
              <ArrowRight size={14} />
            </Button>
          ) : (
            <Button
              variant="gradient"
              className="h-11 px-5 rounded-full flex items-center gap-2 font-semibold"
              onClick={() => void handleConfirm()}
            >
              <ShieldCheck size={15} />
              {transferLocale.confirmTransfer}
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
      title={transferLocale.title}
      subtitle={transferLocale.subtitle}
      footer={renderFooter()}
      className="max-w-2xl"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
          <ArrowRightLeft size={18} className="text-orange-500" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900 leading-tight">
            {transferLocale.title}
          </h2>
          <p className="text-sm text-gray-400">{transferLocale.subtitle}</p>
        </div>
      </div>
      {renderBody()}
    </Modal>
  );
}
