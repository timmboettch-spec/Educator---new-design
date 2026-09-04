import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal';
import { Button } from '../ui/Button';
import { toast } from '../common/Toast';
import { ACCOUNT_VALIDATION } from '@/utils/messages/account';
import FormField from '../ui/FormField';
import Input from '../ui/Input';
import {
  sanitizeTextForTyping,
  trimBoundaryWhitespace,
  hasUnsafeMarkupOrScriptPattern,
  hasDisallowedClassNameChars,
  hasSqlInjectionLikePattern,
  hasBlockedCodingKeyword,
  hasCodeLikeSyntaxPattern,
  hasNameCodeLikePattern,
} from '@/utils/inputSecurity';

const EDIT_NAME_MAX_LENGTH = 50;

type EditProfileModalProps = {
  showEditProfileModal: boolean;
  setShowEditProfileModal: (open: boolean) => void;
  editName: string;
  setFullNameError: (error: string) => void;
  setFullName: (name: string) => void;
  email: string;
  handleSave: (name: string) => Promise<void>;
  fullNameError: string;
  setEditName: (name: string) => void;
  copy?: {
    title?: string;
    cancel?: string;
    saveChanges?: string;
    fullName?: string;
    fullNamePlaceholder?: string;
    email?: string;
  };
};

export default function EditProfileModal({
  showEditProfileModal,
  setShowEditProfileModal,
  editName,
  setFullNameError,
  setFullName,
  email,
  handleSave,
  fullNameError,
  setEditName,
  copy,
}: EditProfileModalProps) {
  const originalNameRef = useRef('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    if (showEditProfileModal) {
      originalNameRef.current = editName;
      setIsSubmitting(false);
    }
  }, [showEditProfileModal]);

  if (!showEditProfileModal) return null;

  const localizedCopy = {
    title: copy?.title ?? 'Edit Profile',
    cancel: copy?.cancel ?? 'Cancel',
    saveChanges: copy?.saveChanges ?? 'Save Changes',
    fullName: copy?.fullName ?? 'Full Name',
    fullNamePlaceholder: copy?.fullNamePlaceholder ?? 'Enter Full Name',
    email: copy?.email ?? 'Email',
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSubmitting) return;
    const trimmed = trimBoundaryWhitespace(editName);
    if (!trimmed) {
      setFullNameError(ACCOUNT_VALIDATION.FULL_NAME_REQUIRED);
      return;
    }
    if (
      hasUnsafeMarkupOrScriptPattern(trimmed) ||
      hasDisallowedClassNameChars(trimmed) ||
      hasSqlInjectionLikePattern(trimmed) ||
      hasBlockedCodingKeyword(trimmed) ||
      hasCodeLikeSyntaxPattern(trimmed) ||
      hasNameCodeLikePattern(trimmed)
    ) {
      setFullNameError('Full name cannot include HTML, script, or code-like content');
      return;
    }    if (trimmed === trimBoundaryWhitespace(originalNameRef.current)) {
      toast.error(ACCOUNT_VALIDATION.NO_CHANGES);
      return;
    }
    setIsSubmitting(true);
    setFullName(trimmed);
    setShowEditProfileModal(false);
    try {
      await handleSave(trimmed);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={showEditProfileModal}
      onClose={() => setShowEditProfileModal(false)}
      title={localizedCopy.title}
      footer={
        <div className="flex gap-4">
          <Button
            type="button"
            onClick={() => setShowEditProfileModal(false)}
            variant="secondary"
            className="w-1/2 h-11 rounded-full"
          >
            {localizedCopy.cancel}
          </Button>
          <Button
            type="submit"
            form="edit-profile-form"
            variant="gradient"
            size="lg"
            className="w-1/2"
            disabled={isSubmitting}
          >
            {localizedCopy.saveChanges}
          </Button>
        </div>
      }
    >
      <form id="edit-profile-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
     
        <button
          type="submit"
          aria-hidden="true"
          tabIndex={-1}
          style={{ position: 'absolute', width: 0, height: 0, padding: 0, border: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}
        />
        <FormField label={localizedCopy.fullName} required error={fullNameError || undefined}>
          <Input
            value={editName}
            placeholder={localizedCopy.fullNamePlaceholder}
            onChange={(e) => {
              const val = sanitizeTextForTyping(e.target.value, EDIT_NAME_MAX_LENGTH)
                .replace(/^ +/, '')
                .replace(/  +/g, ' ');
              if (/^ +$/.test(val)) return;
              if (
                hasUnsafeMarkupOrScriptPattern(val) ||
                hasBlockedCodingKeyword(val) ||
                hasCodeLikeSyntaxPattern(val) ||
                hasNameCodeLikePattern(val)
              ) return;
              setEditName(val);
              if (fullNameError) setFullNameError('');
            }}
          />
        </FormField>
        <FormField label={localizedCopy.email}>
          <Input
            value={email}
            disabled
            inputClassName="bg-gray-100 text-gray-500 cursor-not-allowed"
          />
        </FormField>
      </form>
    </Modal>
  );
}
