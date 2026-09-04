import { useSelector } from 'react-redux';
import { Presentation, GraduationCap, CheckCircle2, FileText } from 'lucide-react';
import { selectClassResponse } from '@/redux/class/GetClassRedux';
import { getEffectiveClassStatus } from '@/utils/classUtils';
import MetricsCard from './MetricsCard';

interface MetricsSummaryLabels {
  activeClasses: string;
  totalStudents: string;
  totalSimulations: string;
  newReports: string;
  regionAriaLabel: string;
}

interface MetricsSummaryProps {
  reportsCount: number;
  labels?: MetricsSummaryLabels;
}

export default function MetricsSummary({ reportsCount, labels }: MetricsSummaryProps) {
  const uiLabels: MetricsSummaryLabels = {
    activeClasses: labels?.activeClasses ?? 'Active Classes',
    totalStudents: labels?.totalStudents ?? 'Total Students',
    totalSimulations: labels?.totalSimulations ?? 'Total Simulations',
    newReports: labels?.newReports ?? 'Unviewed New Reports',
    regionAriaLabel: labels?.regionAriaLabel ?? 'Metrics Summary',
  };

  const classResponse = useSelector(selectClassResponse);
  const allClasses = classResponse?.data?.classes ?? [];
  const activeClasses = allClasses.filter(
    (cls) => getEffectiveClassStatus(cls.status, cls.start_date, cls.end_date) === 'ACTIVE',
  );

  const totalStudents = activeClasses.reduce((sum, cls) => sum + (cls.students?.length ?? 0), 0);
  const totalSimulations = activeClasses.reduce(
    (sum, cls) => sum + (cls.sims?.length ?? 0),
    0,
  );

  // Icons match the admin portal: Presentation = classes, GraduationCap =
  // students, CheckCircle2 = simulations, FileText = reports.
  const metrics = [
    { label: uiLabels.activeClasses, value: activeClasses.length, icon: Presentation },
    { label: uiLabels.totalStudents, value: totalStudents, icon: GraduationCap },
    { label: uiLabels.totalSimulations, value: totalSimulations, icon: CheckCircle2 },
    { label: uiLabels.newReports, value: reportsCount, icon: FileText },
  ];

  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4"
      role="region"
      aria-label={uiLabels.regionAriaLabel}
    >
      {metrics.map((m) => (
        <MetricsCard
          key={m.label}
          label={m.label}
          value={m.value}
          icon={m.icon}
        />
      ))}
    </div>
  );
}
