import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../src/i18n';
import type { SimulationDetail as SimulationDetailType } from '../../../src/types/index';

const generateSupportingDocument = vi.hoisted(() => vi.fn());

vi.mock('@/store/hooks', () => ({
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve() }),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ simulationCatalog: { selectedItem: null } }),
}));
vi.mock(
  '../../../src/redux/simulation/Simulationdetailredux',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../src/redux/simulation/Simulationdetailredux')
    >()),
    clearSimulationDetail: () => ({ type: 'noop' }),
    fetchUnitDataRequest: () => ({ type: 'noop' }),
    selectSimulationDetail: () => null,
  })
);
vi.mock(
  '../../../src/redux/simulation/SimulationResolveRedux',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../src/redux/simulation/SimulationResolveRedux')
    >()),
    clearResolvedScenario: () => ({ type: 'noop' }),
    fetchSimulationRequest: () => ({ type: 'noop' }),
    selectEffectiveScenarioId: () => () => 'sim-1',
  })
);
vi.mock(
  '../../../src/redux/simulation/MyLibraryRedux',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../src/redux/simulation/MyLibraryRedux')
    >()),
    selectLibrarySimulationIds: () => [],
    selectLibraryUnits: () => [],
    addPendingLibraryId: () => ({ type: 'noop' }),
    removePendingLibraryId: () => ({ type: 'noop' }),
    addPendingRemoveId: () => ({ type: 'noop' }),
    removePendingRemoveId: () => ({ type: 'noop' }),
  })
);
vi.mock(
  '@/redux/dashboard/simulationlibrary/GetSimulationRedux',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/redux/dashboard/simulationlibrary/GetSimulationRedux')
    >()),
    selectSimulationLibraryData: () => [],
  })
);
vi.mock(
  '../../../src/redux/simulation/FetchSimulationCatalogRedux',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../src/redux/simulation/FetchSimulationCatalogRedux')
    >()),
    clearSelectedSimulation: () => ({ type: 'noop' }),
  })
);
vi.mock(
  '@/redux/simulation/RemoveFromLibraryRedux',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/redux/simulation/RemoveFromLibraryRedux')
    >()),
    RemoveFromLibraryRequest: () => ({ type: 'noop' }),
    selectLibraryRemoving: () => false,
  })
);
vi.mock(
  '@/redux/simulation/AddToLibraryRequestRedux',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/redux/simulation/AddToLibraryRequestRedux')
    >()),
    AddToLibraryRequest: () => ({ type: 'noop' }),
    selectLibraryAdding: () => false,
  })
);
vi.mock('@/redux/auth/LoginRedux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/redux/auth/LoginRedux')>()),
  selectIsStartTrial: () => false,
}));
vi.mock('@/lib/simulationDocuments', () => ({
  generateSupportingDocument,
}));

import SimulationDetail from '../../../src/components/simulation/Simulationdetail';

const DETAIL: SimulationDetailType = {
  id: 'sim-1',
  title: 'First-Time Hyperglycemia',
  avatarEnabled: false,
  difficultyLevel: 'Medium',
  estimatedDuration: '25 min',
  department: 'Outpatient Urgent Care',
  learnerLevel: 'Post-Secondary Nursing',
  unit: 'AlphaTesting-01',
  description: 'A patient presents with signs of new-onset hyperglycemia.',
  learningObjective: 'Perform a focused assessment\nEducate the patient',
  topicsAddressed: 'Communication; Patient education',
  productName: 'Adult Nursing Manikin',
  additionalEquipment: '',
  sbar: { situation: 'Patient reports thirst', background: '' },
};

const renderDetail = (detail: SimulationDetailType = DETAIL) =>
  render(
    <MemoryRouter>
      <SimulationDetail
        simulationId="sim-1"
        initialData={{ id: 1, title: detail.title, image: '', cta: 'View' }}
        publicDetail={detail}
        onBack={vi.fn()}
        fromLibrary
      />
    </MemoryRouter>
  );

describe('SimulationDetail (approved design)', () => {
  beforeEach(() => {
    generateSupportingDocument.mockReset().mockResolvedValue(undefined);
  });

  it('shows the name, back link and the populated detail tiles', () => {
    renderDetail();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'First-Time Hyperglycemia',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Back to Library/ })
    ).toBeInTheDocument();
    for (const value of [
      'Manikin',
      'Post-Secondary Nursing',
      '25 min',
      'Outpatient Urgent Care',
      'AlphaTesting-01',
    ]) {
      expect(screen.getByTitle(value)).toBeInTheDocument();
    }
    expect(screen.getByText('Modality')).toBeInTheDocument();
  });

  it('starts with every section collapsed and hides sections without data', () => {
    renderDetail();
    for (const name of [
      'Simulation Overview',
      'Additional Details',
      'Patient Handoff SBAR',
      'Facilitation Documents',
    ]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-expanded',
        'false'
      );
    }
    expect(
      screen.queryByRole('button', { name: 'Student Briefing' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it('expands and collapses every section at once', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));

    expect(
      screen.getByRole('button', { name: 'Simulation Overview' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText('Perform a focused assessment')
    ).toBeInTheDocument();
    expect(screen.getByText('Adult Nursing Manikin')).toBeInTheDocument();
    expect(screen.getByText('Patient reports thirst')).toBeInTheDocument();
    // Empty fields inside an open section are left out, not shown blank.
    expect(screen.queryByText('Background')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse All' }));
    expect(
      screen.queryByText('Patient reports thirst')
    ).not.toBeInTheDocument();
  });

  it('prepares a facilitation document when its card is used', async () => {
    renderDetail();
    fireEvent.click(
      screen.getByRole('button', { name: 'Facilitation Documents' })
    );
    expect(
      screen.getByRole('region', { name: 'Instructor-Facing' })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Simulation Set-Up Guide' })
    );
    await waitFor(() =>
      expect(generateSupportingDocument).toHaveBeenCalledWith(
        'setup-guide',
        expect.objectContaining({ title: 'First-Time Hyperglycemia' }),
        'simulation-set-up-guide.pdf'
      )
    );
  });

  it('treats every shown section as all-open, ignoring sections without data', () => {
    // No student briefing: opening the four shown sections one by one is "all".
    renderDetail();
    for (const name of [
      'Simulation Overview',
      'Additional Details',
      'Patient Handoff SBAR',
      'Facilitation Documents',
    ]) {
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(
      screen.getByRole('button', { name: 'Collapse All' })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  describe('while the full details load or fail', () => {
    const renderWithStatus = (
      detailsStatus: 'loading' | 'failed',
      onRetryDetails = vi.fn()
    ) => {
      render(
        <MemoryRouter>
          <SimulationDetail
            simulationId="sim-1"
            initialData={{
              id: 1,
              title: 'First-Time Hyperglycemia',
              image: '',
              cta: 'View',
              difficulty: 'Medium',
            }}
            publicDetail={null}
            onBack={vi.fn()}
            fromLibrary
            detailsStatus={detailsStatus}
            onRetryDetails={onRetryDetails}
          />
        </MemoryRouter>
      );
      return onRetryDetails;
    };

    it('keeps the hero and shows a loading placeholder for the sections', () => {
      renderWithStatus('loading');

      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'First-Time Hyperglycemia',
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('status', { name: 'Loading simulation details' })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Expand All' })
      ).not.toBeInTheDocument();
    });

    it('shows an inline error with Retry when the details could not load', () => {
      const onRetryDetails = renderWithStatus('failed');

      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't load the full details"
      );
      expect(
        screen.getByRole('button', { name: /Back to Library/ })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onRetryDetails).toHaveBeenCalledTimes(1);
    });
  });

  describe('language', () => {
    afterEach(async () => {
      await act(() => i18n.changeLanguage('en'));
    });

    it('switches every label, tile value and document name together', async () => {
      renderDetail();
      expect(screen.getByTitle('Manikin')).toBeInTheDocument();

      await act(() => i18n.changeLanguage('es'));

      expect(screen.getByTitle('Maniquí')).toBeInTheDocument();
      expect(screen.getByTitle('Medio')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Volver a la biblioteca/ })
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Expandir todo' }));
      expect(
        screen.getByRole('button', { name: 'Traspaso del Paciente SBAR' })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Guía de configuración de la simulación',
        })
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Simulation Set-Up Guide')
      ).not.toBeInTheDocument();
    });
  });

  it('has no preview or share actions', () => {
    renderDetail();
    expect(
      screen.queryByRole('button', { name: /Preview/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Share/ })
    ).not.toBeInTheDocument();
  });
});
