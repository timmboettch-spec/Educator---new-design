import { Button } from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import type { StudentAccess } from "../../types/index";

interface PrintAccessCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  mode: "single" | "bulk";
  student?: StudentAccess;
  students?: StudentAccess[];
}

export default function PrintAccessCodeModal({
  isOpen,
  onClose,
  className,
  mode,
  student,
  students = [],
}: PrintAccessCodeModalProps) {
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).printAccessCode;
  const handlePrint = () => {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      alert(t.popupBlocked);
      return;
    }

    if (printWindow) {
      let content = "";

      if (mode === "single" && student) {
        content = `
          <p class="title">${t.printTitleSingle}</p>
          <div class="box">
            <div class="row"><span class="label">${t.printColStudentName}</span><span>:</span><span class="value">${student.studentName}</span></div>
            <div class="row"><span class="label">${t.labelClassName}</span><span>:</span><span class="value">${className}</span></div>
            <div class="row"><span class="label">${t.printColStudentCode}</span><span>:</span><span class="code">${student.accessCode}</span></div>
          </div>
        `;
      }

      if (mode === "bulk") {
        const sortedStudents = [...students].sort((a, b) =>
          (a.studentName ?? "").localeCompare(b.studentName ?? ""),
        );
        const rows = sortedStudents
          .map(
            (s) => `
              <tr>
                <td>${s.studentName}</td>
                <td class="code-cell">${s.accessCode}</td>
              </tr>
            `,
          )
          .join("");

        content = `
          <div class="class-name">${className}</div>
          <div class="title">${t.printTitleBulk}</div>
          <table>
            <thead>
              <tr>
                <th>${t.printColStudentName}</th>
                <th>${t.printColStudentCode}</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `;
      }

      printWindow.document.write(`
        <html>
        <head>
          <title>Student Code</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: sans-serif; padding: 40px; display: flex; flex-direction: column; align-items: center; }
            .title { font-size: 24px; font-weight: 700; color: #db8833; text-align: center; margin-bottom: 32px; }
            .class-name { font-size: 20px; font-weight: 700; color: #1f2937; text-align: center; margin-bottom: 8px; }

            /* Single styles */
            .box { border: 2px dashed #e5e7eb; border-radius: 12px; padding: 40px 48px; }
            .row { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
            .label { font-size: 13px; color: #1f2937; font-weight: 750; text-transform: uppercase; letter-spacing: 0.1em; width: 180px; }
            .value { font-size: 16px; color: #9ca3af;}
            .code { font-size: 16px; color: #9ca3af;}

            /* Bulk table styles */
            table { width: 100%; border-collapse: collapse; }
            th {  color: #1f1b1b; padding: 10px 16px;  font-weight: 750; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #e5e7eb; }
            td { padding: 10px 16px; font-size: 14px; color: #363638; border: 1px solid #e5e7eb; }
            .code-cell { color: #363638;}
          </style>
        </head>
        <body>
          ${content}
        </body>
        </html>
      `);

      printWindow.document.close();
      printWindow.focus();
      printWindow.onafterprint = () => printWindow.close();
      printWindow.print();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.title}>
      <div className="flex flex-col items-center text-center px-4 py-2">
        {mode === "single" && student && (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 w-full mb-6 bg-gray-50">
            <p className="text-xs text-gray-600 uppercase tracking-widest mb-1">
              {t.labelStudent}
            </p>
            <p className="text-base font-bold text-black">
              {student.studentName}
            </p>
            <p className="text-base text-gray-700 mb-5">{className}</p>
            <p className="text-xs text-black uppercase tracking-widest mb-2">
              {t.labelStudentCode}
            </p>
            <p className="text-2xl font-semibold text-primary-500">
              {student.accessCode}
            </p>
          </div>
        )}

        {mode === "bulk" && (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 w-full mb-6 bg-gray-50">
            <p className="text-lg font-bold text-black mb-5">{className}</p>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-2">
              {t.labelStudentCode}
            </p>
            <p className="text-xs text-gray-700 uppercase tracking-widest mb-4">
              {t.labelAllStudentsCode}
            </p>
          </div>
        )}

        <div className="flex gap-4 w-full">
          <Button
            variant="secondary"
            onClick={onClose}
            className="w-1/2 h-11 rounded-full"
          >
            {t.back}
          </Button>
          <Button
            onClick={handlePrint}
            className="w-1/2 h-11 rounded-full bg-primary-500 text-white"
          >
            {t.print}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
