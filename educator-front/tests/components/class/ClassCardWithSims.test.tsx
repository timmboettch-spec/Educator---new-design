import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/i18n';
import { ClassCardWithSims } from '../../../src/components/class/ClassCardWithSims';
import type { Class } from '../../../src/types/Class_types';

const labels = {
  activeStudents: 'Active Students',
  activeSimulations: 'Active Simulations',
  newReports: 'New Reports',
  reportNote: 'Reports not reviewed since last log in',
  manageStudent: 'Manage Students',
  manageSims: 'Manage Sims',
  viewReports: 'View Reports',
  statusActive: 'Active',
  statusInactive: 'Inactive',
};

const makeClass = (overrides: Partial<Class> = {}): Class =>
  ({
    id: 'class-1',
    class_name: 'Nursing 101',
    status: 'ACTIVE',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    students: [],
    sims: [],
    ...overrides,
  }) as Class;

const renderCard = (cls: Class) =>
  render(
    <MemoryRouter>
      <ClassCardWithSims cls={cls} reportsCount={0} labels={labels} />
    </MemoryRouter>
  );

describe('ClassCardWithSims LMS linkage', () => {
  it('carries the class linkage through to the dashboard card pill', () => {
    renderCard(
      makeClass({
        lms_linkage: {
          provider: 'canvas',
          courseId: 'course-9',
          courseName: 'Intro to Nursing',
        },
      })
    );

    expect(screen.getByText('Canvas')).toHaveAttribute(
      'aria-label',
      'Linked to Canvas course “Intro to Nursing”'
    );
  });

  it('shows no pill for a manual class', () => {
    renderCard(makeClass());

    expect(screen.getByText('Nursing 101')).toBeInTheDocument();
    expect(screen.queryByText('Canvas')).not.toBeInTheDocument();
  });
});
