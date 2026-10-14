import axios from 'axios';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/components/common/Toast';
import { StudentCodesExportFormat } from '@/redux/api/classes/classes.types';
import {
  buildStudentCodesFileName,
  getExportErrorMessage,
  parseStudentCodesCsv,
} from '@/redux/api/classes/classesService';
import { getStudentCodesExport } from '@/redux/api/classes/studentCodesExport.api';
import { downloadBlob } from '@/utils/chartExport';
import {
  buildPrintPreparingHtml,
  buildStudentCodesPrintHtml,
  writeWindowDocument,
} from '@/utils/studentCodesPrint';

interface ClassRef {
  classId: string;
  className: string;
}

interface ExportArgs extends ClassRef {
  format: StudentCodesExportFormat;
}

/**
 * Downloads or prints a class's student codes from the BE export. Each class
 * row has its own instance, so only one request runs at a time per class (a
 * second one is ignored); different classes export independently, each with its
 * own cancel and loading state. Failures show the BE message or a generic one
 * as a toast. `cancelExport` stops the request in flight
 * without saving a file, printing or showing a toast.
 */
export function useStudentCodesExport() {
  const { t } = useTranslation('classManagement');
  const [isExporting, setIsExporting] = useState(false);
  // A ref, not the state, so two clicks in the same render can't both start.
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);

  /** Runs `task` as the only request, cancellable through `cancelExport`. */
  const runExclusive = async (
    task: (signal: AbortSignal) => Promise<boolean>,
    onCancelOrFail: () => void = () => {}
  ): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setIsExporting(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const done = await task(abort.signal);
      // Cancelled after the response arrived: don't save or print it.
      if (abort.signal.aborted) {
        onCancelOrFail();
        return false;
      }
      return done;
    } catch (error) {
      onCancelOrFail();
      if (abort.signal.aborted || axios.isCancel(error)) return false;
      toast.error(
        await getExportErrorMessage(
          error,
          t('rowActions.exportStudentCodesError')
        )
      );
      return false;
    } finally {
      controller.current = null;
      inFlight.current = false;
      setIsExporting(false);
    }
  };

  /** Downloads the CSV or PDF. Resolves true when the file was downloaded. */
  const exportStudentCodes = ({ classId, className, format }: ExportArgs) =>
    runExclusive(async (signal) => {
      const blob = await getStudentCodesExport(classId, format, signal);
      if (signal.aborted) return false;
      downloadBlob(blob, buildStudentCodesFileName(className, format));
      return true;
    });

  /**
   * Prints all of a class's student codes in a new window, as the class menu
   * always has, but from the BE export so names show and only usable codes are
   * listed. The window opens before the request, while still inside the click,
   * so pop-up blockers (Safari's included) allow it. Resolves true once the
   * print dialog has been requested.
   */
  const printStudentCodes = ({ classId, className }: ClassRef) => {
    if (inFlight.current) return Promise.resolve(false);
    const windowTitle = t('printStudentCodes.windowTitle');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error(t('printStudentCodes.popupBlocked'));
      return Promise.resolve(false);
    }
    writeWindowDocument(
      printWindow,
      buildPrintPreparingHtml(windowTitle, t('printStudentCodes.preparing'))
    );

    return runExclusive(
      async (signal) => {
        const blob = await getStudentCodesExport(
          classId,
          StudentCodesExportFormat.CSV,
          signal
        );
        const students = parseStudentCodesCsv(await blob.text());
        // The educator closed the window while it loaded: nothing to print.
        if (signal.aborted || printWindow.closed) return false;

        writeWindowDocument(
          printWindow,
          buildStudentCodesPrintHtml(className, students, {
            windowTitle,
            heading: t('printStudentCodes.printHeading'),
            studentName: t('printStudentCodes.columnStudentName'),
            studentCode: t('printStudentCodes.columnStudentCode'),
            noStudents: t('printStudentCodes.noStudents'),
            missingName: t('printStudentCodes.missingName'),
          })
        );
        printWindow.focus();
        printWindow.onafterprint = () => printWindow.close();
        printWindow.print();
        return true;
      },
      () => printWindow.close()
    );
  };

  const cancelExport = () => controller.current?.abort();

  return { exportStudentCodes, printStudentCodes, cancelExport, isExporting };
}
