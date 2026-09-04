import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { toast as sonnerToast, Toaster as Sonner } from 'sonner';
import { store } from '../../store';
import { setPendingToast } from '../../redux/loader/loaderSlice';
import type { PendingToast } from '../../redux/loader/loaderSlice';
import { isAppLoaderVisible } from './AppLoader';

type ToastMessage = string | number;

export const SESSION_TOAST_KEY = 'app_pending_toast';

function smartToast(
  type: PendingToast['type'],
  message: ToastMessage,
): void {

  const state = store.getState() as { Logout?: { status?: string } };
  const isLogoutCompleted = state.Logout?.status === 'succeeded';

  if (isLogoutCompleted) {
    sessionStorage.setItem(
      SESSION_TOAST_KEY,
      JSON.stringify({ type, message: String(message) }),
    );
    return;
  }

  sonnerToast.dismiss();

  if (isAppLoaderVisible) {
    store.dispatch(setPendingToast({ type, message: String(message) }));
  } else {
    sonnerToast[type](message);
  }
}

export const toast = {
  success: (message: ToastMessage) => smartToast('success', message),
  error: (message: ToastMessage) => { sonnerToast.dismiss(); sonnerToast.error(message); },
  info: (message: ToastMessage) => smartToast('info', message),
  warning: (message: ToastMessage) => smartToast('warning', message),
  dismiss: sonnerToast.dismiss,
  loading: sonnerToast.loading,
  promise: sonnerToast.promise,
  message: sonnerToast.message,
  custom: sonnerToast.custom,
};

export { sonnerToast };

const Toast = () => {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      closeButton={true}
      richColors={false}
      icons={{
        success: <CheckCircle2 className="w-5 h-5 text-feedback-success" />,
        error: <XCircle className="w-5 h-5 text-feedback-error" />,
        info: <Info className="w-5 h-5 text-feedback-info" />,
        warning: <AlertCircle className="w-5 h-5 text-feedback-warning" />,
      }}
      toastOptions={{
        duration: 2000,
        classNames: {
          toast:
            'group toast !text-neutral-900 group-[.toaster]:bg-white group-[.toaster]:rounded-lg group-[.toaster]:p-5 group-[.toaster]:min-w-[380px] group-[.toaster]:max-w-[420px] group-[.toaster]:border-neutral-100 group-[.toaster]:flex group-[.toaster]:items-center group-[.toaster]:gap-3 group-[.toaster]:relative group-[.toaster]:overflow-hidden',
          title:
            '!font-semibold !text-[15px] !text-neutral-900 !m-0 !leading-none !mt-[2px] !opacity-100 !visible',
          description: '!text-neutral-500 !text-[14px] !leading-snug !mt-1.5 !opacity-100 !visible',
          closeButton:
            '!absolute !right-3 !inset-y-0 !my-auto !bg-transparent !border-none !text-slate-400 hover:!text-slate-600 transition-colors !opacity-100 !visible !p-0 !w-auto !h-auto',
          success: '[&_.toast-border]:!bg-feedback-success',
          error: '[&_.toast-border]:!bg-feedback-error',
          info: '[&_.toast-border]:!bg-feedback-info',
          warning: '[&_.toast-border]:!bg-feedback-warning',
        },
      }}
    />
  );
};

export default Toast;
