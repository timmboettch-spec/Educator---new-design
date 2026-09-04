import ClassCard from '../ui/ClassCard';
import { Class } from '@/types/Class_types';

interface ClassCardLabels {
  activeStudents: string;
  activeSimulations: string;
  newReports: string;
  reportNote: string;
  manageStudent: string;
  manageSims: string;
  viewReports: string;
  statusActive: string;
  statusInactive: string;
}

export function ClassCardWithSims({
  cls,
  reportsCount,
  labels,
}: {
  cls: Class;
  reportsCount: number;
  labels: ClassCardLabels;
}) {
  const isActive = cls.status === 'ACTIVE';

  return (
    <ClassCard
      key={cls.id}
      title={cls.class_name}
      year={cls.year ? Number(cls.year) : undefined}
      term={cls.term}
      startDate={cls.start_date}
      endDate={cls.end_date}
      status={isActive ? 'Active' : 'Inactive'}
      statusLabel={isActive ? labels.statusActive : labels.statusInactive}
      hideStatus
      activeStudents={cls.students?.length ?? 0}
      simulations={cls.sims?.length ?? 0}
      newReports={reportsCount}
      reportNote={labels.reportNote}
      labels={{
        activeStudents: labels.activeStudents,
        activeSimulations: labels.activeSimulations,
        newReports: labels.newReports,
        manageStudent: labels.manageStudent,
        manageSims: labels.manageSims,
        viewReports: labels.viewReports,
      }}
      classId={cls.id}
    />
  );
}
