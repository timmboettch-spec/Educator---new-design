import type { ExportSource } from '@/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReportData, ReportItem } from '../../types/index';

export function ExportPDF(
  source: ExportSource,
  filenameBase: string,
  reportData: ReportData,
  student: boolean
): void {
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.setTextColor(234, 88, 12);
  doc.text('Assessment Report', 14, 20);

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  if (student) {
    doc.text(`Student: ${reportData.student_name ?? '-'}`, 14, 35);
  } else {
    doc.text(`Scenario: ${reportData.scenario_id ?? '-'}`, 14, 35);
  }
  doc.text(`Class: ${source.className ?? '-'}`, 14, 43);

  doc.text(`Overall Score: ${reportData?.score ?? '-'}%`, 14, 51);

  doc.setFontSize(15);
  doc.setTextColor(234, 88, 12);
  doc.text('Executive Summary', 14, 65);

  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);

  doc.text(reportData?.rubricsSummary ?? 'No summary available', 14, 78, {
    maxWidth: 180,
  });

  doc.setFontSize(15);
  doc.setTextColor(234, 88, 12);
  doc.text('Performance Summary', 14, 100);

  autoTable(doc, {
    startY: 108,
    head: student
      ? [['Scenario', 'Score', 'Status']]
      : [['Student Name', 'Score', 'Status']],
    body: student
      ? (reportData?.reports?.map((item: ReportItem) => [
          item?.scenario_id ?? '-',
          `${item?.report_data?.score ?? 0}%`,
          item?.report_data?.summary ?? '-',
        ]) ?? [])
      : (reportData?.reports?.map((item: ReportItem) => [
          item?.student_name ?? '-',
          `${item?.report_data?.score ?? 0}%`,
          item?.report_data?.summary ?? '-',
        ]) ?? []),
    headStyles: {
      fillColor: [234, 88, 12],
      textColor: 255,
    },
  });

  doc.save(`${filenameBase}.pdf`);
}
