import { act, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../../src/i18n';
import { SimulationDetailsPanel } from '../../../src/components/simulation/SimulationDetailsPanel';
import type { Simulation } from '../../../src/redux/dashboard/simulationlibrary/GetSimulationRedux';
import { renderWithProviders } from '../../../src/test/testUtils';

const sim = (overrides: Partial<Simulation> = {}): Simulation => ({
  id: 'colostomy-care',
  simulation_id: 'colostomy-care',
  title: 'Colostomy Care',
  name: 'Colostomy Care',
  unit: 'u1',
  unit_name: 'Gastro',
  duration: '30 min',
  image: '',
  description: 'Care for a colostomy patient.',
  assigned: false,
  rating: 0,
  difficulty: 'Beginner',
  learnerLevel: 'Secondary',
  clinicalSetting: 'Med Surg',
  learningObjectives: ['Assess the stoma', 'Teach self-care'],
  ...overrides,
});

const panel = () => screen.getByRole('region', { name: 'Simulation Details' });

describe('SimulationDetailsPanel', () => {
  it('shows each detail with its label', () => {
    renderWithProviders(<SimulationDetailsPanel sim={sim()} />);
    const details = within(panel());
    expect(details.getByText('Difficulty')).toBeInTheDocument();
    expect(details.getByText('Beginner')).toBeInTheDocument();
    expect(details.getByText('30 min')).toBeInTheDocument();
    expect(details.getByText('Med Surg')).toBeInTheDocument();
    expect(
      details.getByText('Care for a colostomy patient.')
    ).toBeInTheDocument();
    expect(
      details.getByText('Assess the stoma; Teach self-care')
    ).toBeInTheDocument();
  });

  it('leaves out details that are empty', () => {
    renderWithProviders(
      <SimulationDetailsPanel
        sim={sim({
          duration: '',
          clinicalSetting: '  ',
          learningObjectives: [],
        })}
      />
    );
    const details = within(panel());
    expect(details.queryByText('Duration')).not.toBeInTheDocument();
    expect(details.queryByText('Clinical Setting')).not.toBeInTheDocument();
    expect(details.queryByText('Learning Objectives')).not.toBeInTheDocument();
  });

  it('renders nothing when the simulation has no details', () => {
    renderWithProviders(
      <SimulationDetailsPanel
        sim={sim({
          difficulty: '',
          duration: '',
          clinicalSetting: '',
          description: '',
          learningObjectives: [],
        })}
      />
    );
    expect(
      screen.queryByRole('region', { name: 'Simulation Details' })
    ).not.toBeInTheDocument();
  });

  describe('in Spanish', () => {
    afterEach(async () => {
      await act(() => i18n.changeLanguage('en'));
    });

    it('uses the library text and localises the duration units', async () => {
      await act(() => i18n.changeLanguage('es'));
      renderWithProviders(
        <SimulationDetailsPanel sim={sim({ duration: '20 minutes' })} />
      );
      const details = within(
        screen.getByRole('region', { name: 'Detalles de la simulación' })
      );
      expect(details.getByText('Dificultad')).toBeInTheDocument();
      expect(details.getByText('20 minutos')).toBeInTheDocument();
    });
  });
});
