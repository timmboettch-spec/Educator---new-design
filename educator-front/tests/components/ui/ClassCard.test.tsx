import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import '../../../src/i18n';
import ClassCard from '../../../src/components/ui/ClassCard';
vi.mock('/assets/dashboard/student.svg', () => ({ default: 'student.svg' }));
vi.mock('/assets/dashboard/sims.svg', () => ({ default: 'sims.svg' }));
vi.mock('/assets/dashboard/report.svg', () => ({ default: 'report.svg' }));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <ClassCard
        title="Math 101"
        classId="class-1"
        activeStudents={0}
        simulations={0}
        newReports={0}
        {...props}
      />
    </MemoryRouter>
  );

describe('ClassCard', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    localStorage.clear();
  });

  // ─── Rendering ───────────────────────────────────────────────
  it('renders title correctly', () => {
    renderCard();
    expect(screen.getByText('Math 101')).toBeInTheDocument();
  });

  it('renders activeStudents, simulations, newReports counts', () => {
    renderCard({ activeStudents: 12, simulations: 5, newReports: 3 });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders default values when props not provided', () => {
    renderCard();
    expect(screen.getAllByText('0').length).toBe(3);
  });

  it('renders reportNote text', () => {
    renderCard({ reportNote: 'Custom report note' });
    expect(screen.getByText('Custom report note')).toBeInTheDocument();
  });

  it('renders all 3 action buttons', () => {
    renderCard();
    expect(screen.getByText('Manage Students')).toBeInTheDocument();
    expect(screen.getByText('Manage Sims')).toBeInTheDocument();
    expect(screen.getByText('View Reports')).toBeInTheDocument();
  });

  it('shows Active status badge', () => {
    renderCard({ status: 'Active' });
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows Inactive status badge', () => {
    renderCard({ status: 'Inactive' });
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('navigates to /classes with students state on Manage Students click', async () => {
    const user = userEvent.setup();
    renderCard({ classId: 'class-1' });
    await user.click(screen.getByText('Manage Students'));
    expect(mockNavigate).toHaveBeenCalledWith('/classes', {
      state: { classId: 'class-1', expandType: 'students' },
    });
  });

  it('navigates to /classes with sims state on Manage Simulations click', async () => {
    const user = userEvent.setup();
    renderCard({ classId: 'class-1' });
    await user.click(screen.getByText('Manage Sims'));
    expect(mockNavigate).toHaveBeenCalledWith('/classes', {
      state: { classId: 'class-1', expandType: 'sims' },
    });
  });

  it('navigates to /classes with reports state on View Reports click', async () => {
    const user = userEvent.setup();
    renderCard({ classId: 'class-1' });
    await user.click(screen.getByText('View Reports'));
    expect(mockNavigate).toHaveBeenCalledWith('/classes', {
      state: { classId: 'class-1', expandType: 'reports' },
    });
  });
  it('does not save seen_students to localStorage on Manage Students click', async () => {
    const user = userEvent.setup();
    renderCard({ classId: 'class-1', activeStudents: 5 });
    await user.click(screen.getByText('Manage Students'));
    expect(localStorage.getItem('seen_students_class-1')).toBeNull();
  });

  it('does not save seen_sims to localStorage on Manage Simulations click', async () => {
    const user = userEvent.setup();
    renderCard({ classId: 'class-1', simulations: 4 });
    await user.click(screen.getByText('Manage Sims'));
    expect(localStorage.getItem('seen_sims_class-1')).toBeNull();
  });

  it('does not save seen_reports to localStorage on View Reports click', async () => {
    const user = userEvent.setup();
    renderCard({ classId: 'class-1', newReports: 2 });
    await user.click(screen.getByText('View Reports'));
    expect(localStorage.getItem('seen_reports_class-1')).toBeNull();
  });
  it('shows no student dot when activeStudents > 0', () => {
    localStorage.setItem('seen_students_class-1', '2');
    const { container } = renderCard({ classId: 'class-1', activeStudents: 5 });
    const dots = container.querySelectorAll('.bg-green-400');
    expect(dots.length).toBe(0);
  });

  it('shows no student dot when activeStudents > 0 regardless of seen value', () => {
    localStorage.setItem('seen_students_class-1', '5');
    const { container } = renderCard({ classId: 'class-1', activeStudents: 5 });
    const dots = container.querySelectorAll('.bg-green-400');
    expect(dots.length).toBe(0);
  });
  it('shows the LMS pill and names the course on hover for a linked class', () => {
    renderCard({
      title: 'Math 101',
      lmsLinkage: {
        provider: 'canvas',
        courseId: 'course-9',
        courseName: 'Intro to Nursing',
      },
    });

    const pill = screen.getByText('Canvas');
    expect(pill).toHaveClass('bg-gray-50');
    expect(pill).toHaveAttribute(
      'aria-label',
      'Linked to Canvas course “Intro to Nursing”'
    );

    fireEvent.mouseEnter(pill);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Linked to Canvas course “Intro to Nursing”'
    );
  });

  it('falls back to the class name when the integration reports no course name', () => {
    renderCard({
      title: 'Math 101',
      lmsLinkage: {
        provider: 'google_classroom',
        courseId: 'gc-1',
        courseName: null,
      },
    });

    const pill = screen.getByText('Google');
    expect(pill).toHaveClass('bg-gray-50');
    expect(pill).toHaveAttribute(
      'aria-label',
      'Linked to Google course “Math 101”'
    );
  });

  it('shows no LMS pill for a manual class', () => {
    renderCard({ title: 'Math 101' });

    expect(screen.queryByText('Canvas')).not.toBeInTheDocument();
    expect(screen.queryByText('Google Classroom')).not.toBeInTheDocument();
  });
});
