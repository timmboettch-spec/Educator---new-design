import axios from 'axios';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getStudentCodesExport = vi.fn();
vi.mock('../../../src/redux/api/classes/studentCodesExport.api', () => ({
  getStudentCodesExport: (...args: unknown[]) => getStudentCodesExport(...args),
}));

const downloadBlob = vi.fn();
vi.mock('../../../src/utils/chartExport', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../src/components/common/Toast', () => ({ toast }));

import '../../../src/i18n';
import { useStudentCodesExport } from '../../../src/hooks/useStudentCodesExport';
import { StudentCodesExportFormat } from '../../../src/redux/api/classes/classes.types';

const args = {
  classId: 'class-1',
  className: 'Math 101',
  format: StudentCodesExportFormat.PDF,
};

describe('useStudentCodesExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [StudentCodesExportFormat.PDF, 'student-codes-Math 101.pdf'],
    [StudentCodesExportFormat.CSV, 'student-codes-Math 101.csv'],
  ])('downloads the %s named after the class', async (format, fileName) => {
    const blob = new Blob(['file']);
    getStudentCodesExport.mockResolvedValueOnce(blob);
    const { result } = renderHook(() => useStudentCodesExport());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.exportStudentCodes({ ...args, format });
    });

    expect(ok).toBe(true);
    expect(getStudentCodesExport).toHaveBeenCalledWith(
      'class-1',
      format,
      expect.any(AbortSignal)
    );
    expect(downloadBlob).toHaveBeenCalledWith(blob, fileName);
    expect(toast.error).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it('shows the BE error message and downloads nothing on failure', async () => {
    getStudentCodesExport.mockRejectedValueOnce({
      response: {
        status: 404,
        data: new Blob([JSON.stringify({ message: 'Class not found.' })]),
      },
    });
    const { result } = renderHook(() => useStudentCodesExport());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.exportStudentCodes(args);
    });

    expect(ok).toBe(false);
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Class not found.');
    expect(result.current.isExporting).toBe(false);
  });

  it('shows the generic message when the error has no BE message', async () => {
    getStudentCodesExport.mockRejectedValueOnce(new Error('Network Error'));
    const { result } = renderHook(() => useStudentCodesExport());

    await act(async () => {
      await result.current.exportStudentCodes(args);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't download the student codes. Please try again."
    );
  });

  it('ignores a second export while one is in flight', async () => {
    let resolve: (value: unknown) => void = () => {};
    getStudentCodesExport.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      })
    );
    const { result } = renderHook(() => useStudentCodesExport());

    let first: Promise<boolean> | undefined;
    let second: boolean | undefined;
    await act(async () => {
      first = result.current.exportStudentCodes(args);
      second = await result.current.exportStudentCodes(args);
    });
    expect(second).toBe(false);
    expect(result.current.isExporting).toBe(true);

    await act(async () => {
      resolve(new Blob(['%PDF']));
      await first;
    });

    expect(getStudentCodesExport).toHaveBeenCalledTimes(1);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(result.current.isExporting).toBe(false);
  });

  describe('cancelExport', () => {
    /** A request that only settles when its abort signal fires, like axios. */
    const pendingUntilAborted = () =>
      getStudentCodesExport.mockImplementationOnce(
        (_id: string, _format: string, signal: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new axios.CanceledError())
            );
          })
      );

    it('cancels the download in flight without saving a file or a toast', async () => {
      pendingUntilAborted();
      const { result } = renderHook(() => useStudentCodesExport());

      let pending: Promise<boolean> | undefined;
      act(() => {
        pending = result.current.exportStudentCodes(args);
      });
      expect(result.current.isExporting).toBe(true);

      let outcome: boolean | undefined;
      await act(async () => {
        result.current.cancelExport();
        outcome = await pending;
      });

      expect(outcome).toBe(false);
      expect(downloadBlob).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(result.current.isExporting).toBe(false);
    });

    it('drops a response that arrives after the cancel', async () => {
      let resolve: (value: Blob) => void = () => {};
      getStudentCodesExport.mockReturnValueOnce(
        new Promise<Blob>((r) => {
          resolve = r;
        })
      );
      const { result } = renderHook(() => useStudentCodesExport());

      let pending: Promise<boolean> | undefined;
      act(() => {
        pending = result.current.exportStudentCodes(args);
      });

      let outcome: boolean | undefined;
      await act(async () => {
        result.current.cancelExport();
        resolve(new Blob(['%PDF']));
        outcome = await pending;
      });

      expect(outcome).toBe(false);
      expect(downloadBlob).not.toHaveBeenCalled();
    });

    it('allows a new download after a cancel', async () => {
      pendingUntilAborted();
      getStudentCodesExport.mockResolvedValueOnce(new Blob(['%PDF']));
      const { result } = renderHook(() => useStudentCodesExport());

      let pending: Promise<boolean> | undefined;
      act(() => {
        pending = result.current.exportStudentCodes(args);
      });
      await act(async () => {
        result.current.cancelExport();
        await pending;
      });

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.exportStudentCodes(args);
      });

      expect(outcome).toBe(true);
      expect(downloadBlob).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no download is running', () => {
      const { result } = renderHook(() => useStudentCodesExport());
      expect(() => result.current.cancelExport()).not.toThrow();
    });
  });

  describe('printStudentCodes', () => {
    const classRef = { classId: 'class-1', className: 'Math 101' };
    const csvBlob = (...lines: string[]) =>
      new Blob(
        [
          [
            'Class Name,Math 101',
            '',
            'Student Code,Student Name',
            ...lines,
          ].join('\r\n'),
        ],
        { type: 'text/csv' }
      );

    /** Stands in for the window `window.open('')` returns. */
    const fakePrintWindow = () => {
      const html: string[] = [];
      const win = {
        closed: false,
        document: {
          open: vi.fn(),
          write: vi.fn((chunk: string) => html.push(chunk)),
          close: vi.fn(),
        },
        focus: vi.fn(),
        print: vi.fn(),
        close: vi.fn(() => {
          win.closed = true;
        }),
        onafterprint: null as (() => void) | null,
      };
      return { win, html };
    };

    const openSpy = (win: unknown) =>
      vi.spyOn(window, 'open').mockReturnValue(win as Window);

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('opens the window before the request, then prints the BE students', async () => {
      const { win, html } = fakePrintWindow();
      const open = openSpy(win);
      getStudentCodesExport.mockResolvedValueOnce(csvBlob('B2,Bo', 'A1,Ana'));
      const { result } = renderHook(() => useStudentCodesExport());

      let pending: Promise<boolean> | undefined;
      act(() => {
        pending = result.current.printStudentCodes(classRef);
      });
      // Opened synchronously, inside the click, so pop-up blockers allow it.
      expect(open).toHaveBeenCalledWith('', '_blank');
      expect(html[0]).toContain('Preparing…');

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await pending;
      });

      expect(outcome).toBe(true);
      expect(getStudentCodesExport).toHaveBeenCalledWith(
        'class-1',
        'csv',
        expect.any(AbortSignal)
      );
      const page = html.at(-1) ?? '';
      expect(page).toContain('Math 101');
      expect(page).toContain('All Student Codes');
      expect(page.indexOf('Ana')).toBeLessThan(page.indexOf('Bo'));
      expect(win.print).toHaveBeenCalledTimes(1);
      win.onafterprint?.();
      expect(win.close).toHaveBeenCalled();
      expect(downloadBlob).not.toHaveBeenCalled();
    });

    it('shows a toast and makes no request when the pop-up is blocked', async () => {
      openSpy(null);
      const { result } = renderHook(() => useStudentCodesExport());

      let outcome: boolean | undefined;
      await act(async () => {
        outcome = await result.current.printStudentCodes(classRef);
      });

      expect(outcome).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(
        'Pop-up blocked. Please allow pop-ups for this site and try again.'
      );
      expect(getStudentCodesExport).not.toHaveBeenCalled();
    });

    it('closes the window and shows the BE error when the request fails', async () => {
      const { win } = fakePrintWindow();
      openSpy(win);
      getStudentCodesExport.mockRejectedValueOnce({
        response: {
          status: 404,
          data: new Blob([JSON.stringify({ message: 'Class not found.' })]),
        },
      });
      const { result } = renderHook(() => useStudentCodesExport());

      await act(async () => {
        await result.current.printStudentCodes(classRef);
      });

      expect(win.close).toHaveBeenCalled();
      expect(win.print).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Class not found.');
    });

    it('closes the window quietly when cancelled', async () => {
      const { win } = fakePrintWindow();
      openSpy(win);
      getStudentCodesExport.mockImplementationOnce(
        (_id: string, _format: string, signal: AbortSignal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new axios.CanceledError())
            );
          })
      );
      const { result } = renderHook(() => useStudentCodesExport());

      let pending: Promise<boolean> | undefined;
      act(() => {
        pending = result.current.printStudentCodes(classRef);
      });
      let outcome: boolean | undefined;
      await act(async () => {
        result.current.cancelExport();
        outcome = await pending;
      });

      expect(outcome).toBe(false);
      expect(win.close).toHaveBeenCalled();
      expect(win.print).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('does not print when the educator closed the window while it loaded', async () => {
      const { win } = fakePrintWindow();
      openSpy(win);
      let resolve: (value: Blob) => void = () => {};
      getStudentCodesExport.mockReturnValueOnce(
        new Promise<Blob>((r) => {
          resolve = r;
        })
      );
      const { result } = renderHook(() => useStudentCodesExport());

      let pending: Promise<boolean> | undefined;
      act(() => {
        pending = result.current.printStudentCodes(classRef);
      });
      win.closed = true;
      let outcome: boolean | undefined;
      await act(async () => {
        resolve(csvBlob('A1,Ana'));
        outcome = await pending;
      });

      expect(outcome).toBe(false);
      expect(win.print).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('does not open a second window while a request is running', async () => {
      const { win } = fakePrintWindow();
      const open = openSpy(win);
      getStudentCodesExport.mockReturnValueOnce(new Promise(() => {}));
      const { result } = renderHook(() => useStudentCodesExport());

      act(() => {
        void result.current.printStudentCodes(classRef);
      });
      let second: boolean | undefined;
      await act(async () => {
        second = await result.current.printStudentCodes(classRef);
      });

      expect(second).toBe(false);
      expect(open).toHaveBeenCalledTimes(1);
    });
  });
});
