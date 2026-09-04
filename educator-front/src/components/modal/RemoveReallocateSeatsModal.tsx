import { useState, useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { Loader2, CheckCircle2 } from 'lucide-react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import SelectField from '../ui/Select';
import { Button } from '../ui/Button';
import { toast } from '../common/Toast';
import {
  RemoveSeats,
  ReallocateSeats,
  clearAllRemoveReallocateState,
} from '../../redux/educator/RemoveReallocateSeatsRedux';
import { GetEducatorByUserRequest } from '../../redux/educator/GetEducatorRedux';
import { getCurrentUserRequest } from '../../redux/users/GetUserRedux';
import { updateStoredUser } from '../../utils/storage';
import type { AppDispatch } from '../../store';
import type { Educator } from '../../types';

type Mode = 'remove' | 'reallocate';

interface RemoveReallocateSeatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  educator: Educator;
  allEducators: Educator[];
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
      {(['remove', 'reallocate'] as Mode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all capitalize ${
            mode === m
              ? 'bg-white shadow text-primary-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {m === 'remove' ? 'Remove' : 'Reallocate'}
        </button>
      ))}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800">{value}</span>
    </div>
  );
}

function blockNonInteger(e: React.KeyboardEvent<HTMLInputElement>) {
  if (['.', '-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
}

function digitsOnly(s: string) {
  return s.replace(/\D/g, '');
}

function validateTokenAmount(raw: string, max: number, action: 'remove' | 'reallocate'): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'This field is required';
  if (!/^\d+$/.test(trimmed)) return 'Only whole numbers are accepted';
  const n = Number(trimmed);
  if (n <= 0) return 'Value must be greater than zero';
  if (n > max) return `You can ${action} a maximum of ${max} available tokens`;
  return '';
}

export default function RemoveReallocateSeatsModal({
  isOpen,
  onClose,
  educator,
  allEducators,
}: RemoveReallocateSeatsModalProps): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const [mode, setMode] = useState<Mode>('remove');

  const [removeAmount, setRemoveAmount] = useState('');
  const [removeTouched, setRemoveTouched] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const [targetId, setTargetId] = useState('');
  const [reallocateAmount, setReallocateAmount] = useState('');
  const [reallocateTouched, setReallocateTouched] = useState(false);
  const [isReallocating, setIsReallocating] = useState(false);

  const availableTokens = educator.remainingTokens ?? educator.tokens ?? 0;

  const emailOptions = useMemo(
    () =>
      allEducators
        .filter(
          (e) =>
            e.id !== educator.id &&
            (e.status || '').toUpperCase() === 'ACTIVE',
        )
        .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''))
        .map((e) => ({
          value: e.id,
          label: e.email ?? e.id,
        })),
    [allEducators, educator.id],
  );

  const selectedTarget = useMemo(
    () => allEducators.find((e) => e.id === targetId) ?? null,
    [allEducators, targetId],
  );

  const targetAvailableTokens = selectedTarget
    ? (selectedTarget.remainingTokens ?? selectedTarget.tokens ?? 0)
    : null;

  useEffect(() => {
    if (isOpen) {
      dispatch(clearAllRemoveReallocateState());
      setMode('remove');
      setRemoveAmount('');
      setRemoveTouched(false);
      setIsRemoving(false);
      setTargetId('');
      setReallocateAmount('');
      setReallocateTouched(false);
      setIsReallocating(false);
    }
  }, [isOpen, dispatch]);

  useEffect(() => {
    setRemoveAmount('');
    setRemoveTouched(false);
    setReallocateAmount('');
    setReallocateTouched(false);
    setTargetId('');
  }, [mode]);

  const removeError = removeTouched
    ? validateTokenAmount(removeAmount, availableTokens, 'remove')
    : '';

  const reallocateError = reallocateTouched
    ? validateTokenAmount(reallocateAmount, availableTokens, 'reallocate')
    : '';

  const canRemove =
    !isRemoving &&
    !!removeAmount.trim() &&
    !validateTokenAmount(removeAmount, availableTokens, 'remove');

  const canReallocate =
    !isReallocating &&
    !!targetId &&
    !!reallocateAmount.trim() &&
    !validateTokenAmount(reallocateAmount, availableTokens, 'reallocate');

  const refreshData = async () => {
    try {
      await dispatch(GetEducatorByUserRequest()).unwrap();
      const userRes = await dispatch(getCurrentUserRequest()).unwrap();
      if (userRes?.data) {
        updateStoredUser({
          subscriptions: (userRes.data as { subscriptions?: unknown[] }).subscriptions,
        });
      }
    } catch {
      return;
    }
  };

  const handleRemove = async (e: React.FormEvent) => {
    e.preventDefault();
    setRemoveTouched(true);
    if (!canRemove) return;
    setIsRemoving(true);
    try {
      await dispatch(
        RemoveSeats({ educatorId: educator.id, amount: Number(removeAmount.trim()) }),
      ).unwrap();
      toast.success(`${removeAmount} token(s) removed and refunded to your account.`);
      await refreshData();
      onClose();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to remove seats');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleReallocate = async (e: React.FormEvent) => {
    e.preventDefault();
    setReallocateTouched(true);
    if (!canReallocate) return;
    setIsReallocating(true);
    try {
      await dispatch(
        ReallocateSeats({
          sourceEducatorId: educator.id,
          targetEducatorId: targetId,
          amount: Number(reallocateAmount.trim()),
        }),
      ).unwrap();
      const targetName = selectedTarget?.full_name ?? selectedTarget?.email ?? 'target educator';
      toast.success(`${reallocateAmount} token(s) reallocated to ${targetName}.`);
      await refreshData();
      onClose();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || 'Failed to reallocate seats');
    } finally {
      setIsReallocating(false);
    }
  };

  const isSubmitting = isRemoving || isReallocating;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Remove / Reallocate Educator Seats"
      subtitle="Manage token allocation for this educator"
      contentClassName="max-w-md"
    >
      <ModeToggle mode={mode} onChange={(m) => !isSubmitting && setMode(m)} />

      {mode === 'remove' && (
        <form onSubmit={(e) => void handleRemove(e)} noValidate>
          <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-3 mb-5">
            <InfoRow label="Educator" value={educator.full_name ?? educator.email ?? '—'} />
            <InfoRow label="Available Tokens" value={availableTokens} />
          </div>

          <Input
            label="Remove Tokens"
            type="text"
            inputMode="numeric"
            value={removeAmount}
            placeholder={`Max ${availableTokens}`}
            error={removeError}
            disabled={isRemoving}
            onKeyDown={blockNonInteger}
            onChange={(e) => {
              setRemoveAmount(digitsOnly(e.target.value));
              setRemoveTouched(true);
            }}
          />

          {!removeError && removeAmount && Number(removeAmount) > 0 && (
            <p className="mt-2 text-sm text-gray-500 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
              {removeAmount} token(s) will be removed and refunded to your account.
            </p>
          )}

          <div className="flex gap-4 w-full mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isRemoving}
              className="w-1/2 h-11 rounded-full text-sm font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gradient"
              disabled={!canRemove}
              className="w-1/2 h-11 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
            >
              {isRemoving && <Loader2 size={14} className="animate-spin" />}
              Remove
            </Button>
          </div>
        </form>
      )}

      {mode === 'reallocate' && (
        <form onSubmit={(e) => void handleReallocate(e)} noValidate>
          <div className="mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Reallocate From
            </p>
            <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-3">
              <InfoRow label="Name" value={educator.full_name ?? '—'} />
              <InfoRow label="Email" value={educator.email ?? '—'} />
              <InfoRow label="Available Tokens" value={availableTokens} />
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Reallocate To
            </p>

            <SelectField
              label="Educator Email"
              placeholder="Select educator email"
              options={emailOptions}
              value={targetId}
              searchable
              onChange={(val) => {
                setTargetId(val);
                setReallocateAmount('');
                setReallocateTouched(false);
              }}
              disabled={isReallocating}
            />

            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Educator Name
              </label>
              <div
                className={`w-full rounded-lg border px-3 py-2 text-sm min-h-[38px] ${
                  selectedTarget
                    ? 'bg-gray-50 border-gray-200 text-gray-800 font-medium'
                    : 'bg-gray-50 border-gray-100 text-gray-500 italic'
                }`}
              >
                {selectedTarget?.full_name ?? 'Auto-populated after selecting an email'}
              </div>
            </div>

            {selectedTarget && (
              <p className="mt-1.5 text-xs text-gray-500">
                Current available tokens:{' '}
                <span className="font-semibold text-gray-600">{targetAvailableTokens}</span>
              </p>
            )}
          </div>

          <Input
            label="Tokens to Reallocate"
            type="text"
            inputMode="numeric"
            value={reallocateAmount}
            placeholder={`Max ${availableTokens}`}
            error={reallocateError}
            disabled={isReallocating || !targetId}
            onKeyDown={blockNonInteger}
            onChange={(e) => {
              setReallocateAmount(digitsOnly(e.target.value));
              setReallocateTouched(true);
            }}
          />

          {!reallocateError && reallocateAmount && Number(reallocateAmount) > 0 && selectedTarget && (
            <p className="mt-2 text-sm text-gray-500 flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
              {reallocateAmount} token(s) will be transferred to{' '}
              {selectedTarget.full_name ?? selectedTarget.email}.
            </p>
          )}

          <div className="flex gap-4 w-full mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isReallocating}
              className="w-1/2 h-11 rounded-full text-sm font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gradient"
              disabled={!canReallocate}
              className="w-1/2 h-11 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium"
            >
              {isReallocating && <Loader2 size={14} className="animate-spin" />}
              Reallocate
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
