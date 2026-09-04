// src/components/modal/tests/MyLibraryModal.test.tsx

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import MyLibraryModal from '../../../src/components/modal/MyLibraryModal';
import type { Simulation } from '../../../src/types/simulation.types';
type MockRootState = {
  SimulationsByUnit: {
    simulations: Simulation[];
    status: string;
    error: string | null;
  };
  AddSimulation: {
    response: null;
    status: string;
    error: string | null;
  };
};

// ─────────────────────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────────────────────

vi.mock('../../../src/components/ui/Modal', () => ({
  default: ({
    children,
    isOpen,
    title,
    className,
  }: {
    children: React.ReactNode;
    isOpen: boolean;
    title?: React.ReactNode;
    className?: string;
  }) => {
    if (!isOpen) return null;
    return (
      <div data-testid="modal" className={className}>
        {title && <h1 data-testid="modal-title">{title}</h1>}
        <div data-testid="modal-content">{children}</div>
      </div>
    );
  },
}));

const mockDispatch = vi.fn();
let mockUnitSimulationsState: Simulation[] = [];
let mockSimulationsStatus = 'idle';

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: MockRootState) => unknown) =>
    selector({
      SimulationsByUnit: {
        simulations: mockUnitSimulationsState,
        status: mockSimulationsStatus,
        error: null,
      },
      AddSimulation: {
        response: null,
        status: 'idle',
        error: null,
      },
    }),
}));

vi.mock('../../../src/redux/dashboard/simulationlibrary/addsimulationredux', () => ({
  fetchSimulationsByUnit: (unit: string) => ({
    type: 'FETCH_SIMULATIONS_BY_UNIT',
    payload: unit,
  }),
  clearSimulationsByUnit: () => ({
    type: 'dashboard/simulationsByUnit/clearSimulationsByUnit',
  }),
  selectUnitSimulations: (state: MockRootState) => state.SimulationsByUnit?.simulations ?? [],
  selectUnitSimLoading: (state: MockRootState) => state.SimulationsByUnit?.status === 'loading',
}));

// ─────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────

const mockSimulation: Simulation = {
  id: 'sim-001',
  title: 'Financial Decision Making',
  unit: 'UNIT-101',
  duration: '45 minutes',
  image: '/assets/simulation-1.png',
  description: 'Learn to make smart financial decisions in a realistic business environment.',
  assigned: false,
  rating: 4.5,
  difficulty: 'Intermediate',
  learnerLevel: 'Intermediate',
  avatarEnabled: true,
};

const mockUnitSimulations: Simulation[] = [
  {
    id: 'sim-001',
    title: 'Financial Decision Making',
    unit: 'UNIT-101',
    duration: '45 minutes',
    image: '/assets/simulation-1.png',
    description: 'Learn to make smart financial decisions in a realistic business environment.',
    assigned: false,
    rating: 4.5,
    difficulty: 'Intermediate',
    learnerLevel: 'Intermediate',
    avatarEnabled: true,
  },
  {
    id: 'sim-002',
    title: 'Investment Analysis',
    unit: 'UNIT-101',
    duration: '50 minutes',
    image: '/assets/simulation-2.png',
    description: 'Analyze investment opportunities and make informed decisions.',
    assigned: true,
    rating: 4.8,
    difficulty: 'Advanced',
    learnerLevel: 'Advanced',
    avatarEnabled: false,
  },
  {
    id: 'sim-003',
    title: 'Risk Management',
    unit: 'UNIT-101',
    duration: '40 minutes',
    image: '/assets/simulation-3.png',
    description: 'Understand and manage financial risks in business scenarios.',
    assigned: false,
    rating: 4.6,
    difficulty: 'Advanced',
    learnerLevel: 'Advanced',
    avatarEnabled: true,
  },
];

const mockOnClose = vi.fn();

// ─────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────

describe('MyLibraryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnitSimulationsState = [];
    mockSimulationsStatus = 'idle';
  });

  describe('Rendering', () => {
    it('renders the modal with correct title', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.getByTestId('modal-title')).toHaveTextContent('Simulation Details');
    });

    it('renders with correct className', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.getByTestId('modal')).toHaveClass('max-w-2xl');
    });

    it('renders simulation category badge', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.getByText('AI Only')).toBeInTheDocument();
    });

    it('applies correct styling to category badge', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      const categoryBadge = screen.getByText('AI Only');
      expect(categoryBadge).toHaveClass(
        'inline-block',
        'text-[11px]',
        'font-medium',
        'px-3',
        'py-1',
        'rounded-full',
        'bg-sky-100',
        'text-sky-600',
        'border',
        'border-sky-200',
      );
    });

    it('renders simulation title', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.getByText('Financial Decision Making')).toBeInTheDocument();
    });

    it('renders simulation description', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(
        screen.getByText(
          'Learn to make smart financial decisions in a realistic business environment.',
        ),
      ).toBeInTheDocument();
    });

    it('renders "Simulations in this Unit:" label', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.getByText('Scenarios in this Unit:')).toBeInTheDocument();
    });
  });

  describe('Redux Integration', () => {
    it('dispatches fetchSimulationsByUnit when simulation.unit is provided', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(mockDispatch).toHaveBeenCalled();
    });

    it('does not dispatch when simulation.unit is not provided', () => {
      const simulationWithoutUnit = { ...mockSimulation, unit: '' };
      render(<MyLibraryModal simulation={simulationWithoutUnit} onClose={mockOnClose} />);

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('dispatches fetchSimulationsByUnit with correct unit parameter', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FETCH_SIMULATIONS_BY_UNIT',
          payload: 'UNIT-101',
        }),
      );
    });

    it('redispatches when simulation.unit changes', () => {
      const { rerender } = render(
        <MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />,
      );

      expect(mockDispatch).toHaveBeenCalledTimes(1);

      rerender(
        <MyLibraryModal
          simulation={{ ...mockSimulation, unit: 'UNIT-202' }}
          onClose={mockOnClose}
        />,
      );

      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it('handles dispatch errors gracefully', () => {
      mockDispatch.mockImplementationOnce(() => {
        throw new Error('Dispatch error');
      });

      expect(() => {
        render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);
      }).not.toThrow();
    });
  });

  describe('Unit Simulations List', () => {
    it('renders "No simulations found" when unitSimulations is empty', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.getByText('No scenarios found.')).toBeInTheDocument();
    });

    it('renders list of simulations when unitSimulations has data', () => {
      mockUnitSimulationsState = mockUnitSimulations;

      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.queryByText('No simulations found.')).not.toBeInTheDocument();

      const allSimTitles = screen.getAllByText('Financial Decision Making');
      expect(allSimTitles.length).toBeGreaterThan(0);

      expect(screen.getByText('Investment Analysis')).toBeInTheDocument();
      expect(screen.getByText('Risk Management')).toBeInTheDocument();
    });

    it('renders correct number of simulation items', () => {
      mockUnitSimulationsState = mockUnitSimulations;

      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('renders simulation titles as list items', () => {
      mockUnitSimulationsState = mockUnitSimulations;

      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      const listItems = screen.getAllByRole('listitem');
      expect(listItems[0]).toHaveTextContent('Financial Decision Making');
      expect(listItems[1]).toHaveTextContent('Investment Analysis');
      expect(listItems[2]).toHaveTextContent('Risk Management');
    });

    it('renders bullet points for each simulation', () => {
      mockUnitSimulationsState = mockUnitSimulations;

      const { container } = render(
        <MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />,
      );

      const bulletPoints = container.querySelectorAll('span.rounded-full.bg-orange-400');

      expect(bulletPoints.length).toBeGreaterThanOrEqual(3);
    });

    it('renders with correct styling for list items', () => {
      mockUnitSimulationsState = [mockUnitSimulations[0]];

      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      const listItem = screen.getByRole('listitem');
      expect(listItem).toHaveClass('flex', 'items-center', 'gap-2', 'text-sm', 'text-slate-600');
    });
  });

  describe('Props and Edge Cases', () => {
    it('accepts onClose prop and component renders without errors', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });

    it('renders with different simulation data', () => {
      const differentSimulation: Simulation = {
        id: 'sim-004',
        title: 'Marketing Strategy',
        unit: 'UNIT-301',
        duration: '60 minutes',
        image: '/assets/simulation-4.png',
        description: 'Develop and execute a successful marketing campaign.',
        assigned: true,
        rating: 4.7,
        difficulty: 'Intermediate',
        learnerLevel: 'Intermediate',
        avatarEnabled: true,
      };

      render(<MyLibraryModal simulation={differentSimulation} onClose={mockOnClose} />);

      expect(screen.getByText('Marketing Strategy')).toBeInTheDocument();
      expect(screen.getByText('AI Only')).toBeInTheDocument();
      expect(
        screen.getByText('Develop and execute a successful marketing campaign.'),
      ).toBeInTheDocument();
    });

    it('handles simulation with special characters in title', () => {
      const specialSimulation: Simulation = {
        ...mockSimulation,
        title: 'Financial & Investment "Decision" Making (Advanced)',
      };

      render(<MyLibraryModal simulation={specialSimulation} onClose={mockOnClose} />);

      expect(
        screen.getByText('Financial & Investment "Decision" Making (Advanced)'),
      ).toBeInTheDocument();
    });

    it('handles long descriptions', () => {
      const longDescription = 'A'.repeat(500);

      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, description: longDescription }}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText(longDescription)).toBeInTheDocument();
    });

    it('handles empty description', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, description: '' }}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
  });

  describe('Modal Props', () => {
    it('passes isOpen as true to Modal', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });

    it('passes onClose prop to Modal', () => {
      const { rerender } = render(
        <MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />,
      );

      expect(screen.getByTestId('modal')).toBeInTheDocument();

      rerender(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} />);

      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
  });

  // ── NEW COVERAGE ──────────────────────────────────────────────────────────────

  describe('Assign to Class Button', () => {
    it('renders Assign to Class button', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} onAssign={vi.fn()} />);
      expect(screen.getByRole('button', { name: /assign to class/i })).toBeInTheDocument();
    });

    it('calls onClose when Assign to Class is clicked', () => {
      const localClose = vi.fn();
      render(<MyLibraryModal simulation={mockSimulation} onClose={localClose} onAssign={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: /assign to class/i }));
      expect(localClose).toHaveBeenCalled();
    });

    it('calls onAssign with simulation id and empty category string when clicked', () => {
      const localAssign = vi.fn();
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} onAssign={localAssign} />);
      fireEvent.click(screen.getByRole('button', { name: /assign to class/i }));
      expect(localAssign).toHaveBeenCalledWith(String(mockSimulation.id), '');
    });
  });

  describe('Loading State', () => {
    it('renders "Loading scenarios..." when unitSimLoading is true', () => {
      mockSimulationsStatus = 'loading';
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} onAssign={vi.fn()} />);
      expect(screen.getByText('Loading scenarios...')).toBeInTheDocument();
    });

    it('does not render simulation list while loading', () => {
      mockSimulationsStatus = 'loading';
      mockUnitSimulationsState = mockUnitSimulations;
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} onAssign={vi.fn()} />);
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });
  });

  describe('Image Rendering', () => {
    it('renders img element when simulation.image is provided', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} onAssign={vi.fn()} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', mockSimulation.image);
      expect(img).toHaveAttribute('alt', mockSimulation.title);
    });

    it('does not render img element when simulation.image is empty string', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, image: '' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });

    it('does not render img element when simulation.image is whitespace only', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, image: '   ' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
  });

  describe('Optional Badges', () => {
    it('renders duration badge when duration is provided', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} onAssign={vi.fn()} />);
      expect(screen.getByText('45 minutes')).toBeInTheDocument();
    });

    it('does not render duration badge when duration is empty', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, duration: '' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.queryByText('45 minutes')).not.toBeInTheDocument();
    });

    it('renders difficulty badge with Easy styling', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, difficulty: 'Easy' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Easy')).toHaveClass('bg-green-50', 'text-green-600');
    });

    it('renders difficulty badge with Hard styling', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, difficulty: 'Hard' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Hard')).toHaveClass('bg-red-50', 'text-red-500');
    });

    it('renders difficulty badge with fallback styling for unknown difficulty', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, difficulty: 'Unknown' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Unknown')).toHaveClass('bg-slate-50', 'text-slate-500');
    });

    it('renders learnerLevel badge with Beginner sky styling', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, learnerLevel: 'Beginner' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Beginner')).toHaveClass('bg-sky-50', 'text-sky-600');
    });

    it('renders learnerLevel badge with Advanced indigo styling', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, difficulty: 'Easy', learnerLevel: 'Advanced' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Advanced')).toHaveClass('bg-indigo-50', 'text-indigo-600');
    });

    it('renders AI Seats Required badge when avatarEnabled is true', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, avatarEnabled: true }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('AI Seats Required')).toBeInTheDocument();
    });

    it('does not render AI Seats Required badge when avatarEnabled is false', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, avatarEnabled: false }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.queryByText('AI Seats Required')).not.toBeInTheDocument();
    });

    it('does not render AI Seats Required badge for non-AI category', () => {
      const noAvatarSim = { ...mockSimulation, avatarEnabled: false };
      render(<MyLibraryModal simulation={noAvatarSim} onClose={mockOnClose} onAssign={vi.fn()} />);
      expect(screen.queryByText('AI Seats Required')).not.toBeInTheDocument();
    });

    it('renders targetAudience badge when different from learnerLevel', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, targetAudience: 'Clinical Staff', learnerLevel: 'Advanced' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Clinical Staff')).toBeInTheDocument();
    });

    it('does not render targetAudience badge when same as learnerLevel', () => {
      render(
        <MyLibraryModal
          simulation={{
            ...mockSimulation,
            difficulty: 'Easy',
            learnerLevel: 'Advanced',
            targetAudience: 'Advanced',
          }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getAllByText('Advanced')).toHaveLength(1);
    });
  });

  describe('Unit Name', () => {
    it('renders unit name when unit_name is provided', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, unit_name: 'Business Fundamentals' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Unit: Business Fundamentals')).toBeInTheDocument();
    });

    it('does not render unit name line when unit_name is empty', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, unit_name: '' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.queryByText(/^Unit:/)).not.toBeInTheDocument();
    });
  });

  describe('Optional Content Sections', () => {
    it('renders Learning Objectives section when learningObjectives has items', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, learningObjectives: ['Objective A', 'Objective B'] }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Learning Objectives')).toBeInTheDocument();
      expect(screen.getByText('Objective A')).toBeInTheDocument();
      expect(screen.getByText('Objective B')).toBeInTheDocument();
    });

    it('does not render Learning Objectives section when array is empty', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, learningObjectives: [] }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.queryByText('Learning Objectives')).not.toBeInTheDocument();
    });

    it('renders Topics Addressed section when topicsAddressed is provided', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, topicsAddressed: 'Risk, Strategy, Finance' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Topics Addressed')).toBeInTheDocument();
      expect(screen.getByText('Risk, Strategy, Finance')).toBeInTheDocument();
    });

    it('renders Product Name section when productName is provided', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, productName: 'Business Simulator Pro' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Product Name')).toBeInTheDocument();
      expect(screen.getByText('Business Simulator Pro')).toBeInTheDocument();
    });

    it('renders Clinical Setting section when clinicalSetting is provided', () => {
      render(
        <MyLibraryModal
          simulation={{ ...mockSimulation, clinicalSetting: 'ICU Ward' }}
          onClose={mockOnClose}
          onAssign={vi.fn()}
        />,
      );
      expect(screen.getByText('Clinical Setting')).toBeInTheDocument();
      expect(screen.getByText('ICU Ward')).toBeInTheDocument();
    });
  });

  describe('View Full Simulation Details Link', () => {
    it('renders the View Full Simulation Details link', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} onAssign={vi.fn()} />);
      expect(
        screen.getByRole('link', { name: /view full simulation details/i }),
      ).toBeInTheDocument();
    });

    it('href uses simulation_id when provided', () => {
      const sim = { ...mockSimulation, simulation_id: 'lib-001' };
      render(<MyLibraryModal simulation={sim} onClose={mockOnClose} onAssign={vi.fn()} />);
      expect(
        screen.getByRole('link', { name: /view full simulation details/i }),
      ).toHaveAttribute('href', `/simulationdetails/${encodeURIComponent('lib-001')}`);
    });

    it('href falls back to simulation.id when simulation_id is absent', () => {
      render(<MyLibraryModal simulation={mockSimulation} onClose={mockOnClose} onAssign={vi.fn()} />);
      expect(
        screen.getByRole('link', { name: /view full simulation details/i }),
      ).toHaveAttribute('href', `/simulationdetails/${encodeURIComponent('sim-001')}`);
    });
  });
});
