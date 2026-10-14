import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '@/store';
import { renderWithProviders } from '@/test/testUtils';
import i18n from '@/i18n';
import * as useEducatorSetupProgressModule from '@/hooks/useEducatorSetupProgress';
import EducatorSetupTracker from './EducatorSetupTracker';

vi.mock('@/hooks/useEducatorSetupProgress');

const mockProgress = (
  overrides: Partial<
    ReturnType<typeof useEducatorSetupProgressModule.useEducatorSetupProgress>
  > = {}
) => {
  vi.mocked(
    useEducatorSetupProgressModule.useEducatorSetupProgress
  ).mockReturnValue({
    eligible: true,
    status: 'ready',
    visible: true,
    steps: [
      { key: 'dashboard', index: 1, route: '/educator-dashboard', done: false },
      { key: 'catalog', index: 2, route: '/simulation-catalog', done: false },
      { key: 'classes', index: 3, route: '/classes', done: false },
      { key: 'library', index: 4, route: '/simulationlibrary', done: false },
      { key: 'account', index: 5, route: '/account', done: false },
    ],
    completedCount: 0,
    totalSteps: 5,
    currentIndex: 1,
    allGatesDone: false,
    dismiss: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  });
};

describe('EducatorSetupTracker (i18n)', () => {
  beforeEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });
  it('renders translated English copy by default', () => {
    mockProgress();
    renderWithProviders(<EducatorSetupTracker />);

    expect(screen.getByText('Educator Set Up Guide')).toBeInTheDocument();
    expect(screen.getByText('0 of 5 steps complete')).toBeInTheDocument();
  });

  it('updates rendered text and <html lang> when the language changes', async () => {
    mockProgress();
    renderWithProviders(<EducatorSetupTracker />);

    await act(() => i18n.changeLanguage('es'));

    expect(
      screen.getByText('Guía de Configuración del Educador')
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
  });

  it('falls back to English for an unsupported language', async () => {
    mockProgress();
    renderWithProviders(<EducatorSetupTracker />);

    await act(() => i18n.changeLanguage('fr'));

    expect(screen.getByText('Educator Set Up Guide')).toBeInTheDocument();
  });
});

describe('EducatorSetupTracker (states)', () => {
  beforeEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('shows a loading placeholder announced to screen readers', () => {
    mockProgress({ status: 'loading', visible: false });
    renderWithProviders(<EducatorSetupTracker />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading your setup guide…');
    expect(screen.queryByText('Educator Set Up Guide')).not.toBeInTheDocument();
  });

  it('shows an unavailable state with a working retry', () => {
    const retry = vi.fn();
    mockProgress({ status: 'error', visible: false, retry });
    renderWithProviders(<EducatorSetupTracker />);

    expect(screen.getByText('Setup guide unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when hidden', () => {
    mockProgress({ status: 'hidden', visible: false });
    const { container } = renderWithProviders(<EducatorSetupTracker />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty (0 of 5) guide for a new educator', () => {
    mockProgress();
    renderWithProviders(<EducatorSetupTracker />);

    expect(screen.getByText('0 of 5 steps complete')).toBeInTheDocument();
  });

  it('translates the unavailable state', async () => {
    mockProgress({ status: 'error', visible: false });
    renderWithProviders(<EducatorSetupTracker />);

    await act(() => i18n.changeLanguage('es'));

    expect(
      screen.getByRole('button', { name: 'Intentar de nuevo' })
    ).toBeInTheDocument();
  });
});

describe('EducatorSetupTracker (accessibility)', () => {
  beforeEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  const doneSteps = (count: number) =>
    (
      [
        ['dashboard', '/educator-dashboard'],
        ['catalog', '/simulation-catalog'],
        ['classes', '/classes'],
        ['library', '/simulationlibrary'],
        ['account', '/account'],
      ] as const
    ).map(([key, route], i) => ({
      key,
      index: i + 1,
      route,
      done: i < count,
    }));

  it('exposes progress as a labelled progressbar', () => {
    mockProgress({ steps: doneSteps(2), completedCount: 2, currentIndex: 3 });
    renderWithProviders(<EducatorSetupTracker />);

    const bar = screen.getByRole('progressbar', { name: 'Setup progress' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuetext', '2 of 5 steps complete');
  });

  it('announces progress changes politely, but not the initial state', () => {
    // Full tree on every render: `renderWithProviders` does not re-wrap on rerender.
    const tree = () => (
      <Provider store={store}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <EducatorSetupTracker />
          </MemoryRouter>
        </I18nextProvider>
      </Provider>
    );
    mockProgress();
    const { rerender } = render(tree());

    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();

    mockProgress({ steps: doneSteps(1), completedCount: 1, currentIndex: 2 });
    rerender(tree());
    expect(region).toHaveTextContent('1 of 5 steps complete');

    mockProgress({
      steps: doneSteps(5),
      completedCount: 5,
      currentIndex: 6,
      allGatesDone: true,
    });
    rerender(tree());
    expect(region).toHaveTextContent(
      "You're all set up. Nice work — you can hide this guide anytime."
    );
  });

  it('links the collapse toggle to the panel it controls', () => {
    mockProgress();
    renderWithProviders(<EducatorSetupTracker />);

    const toggle = screen.getByRole('button', { name: /collapse/i });
    const panelId = toggle.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId as string)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(panelId as string)).not.toBeInTheDocument();
  });

  it('keeps every control reachable by keyboard', () => {
    mockProgress();
    renderWithProviders(<EducatorSetupTracker />);

    // Start, 5 steps, Finish, collapse toggle and the step's call-to-action.
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(9);
    buttons.forEach((button) => {
      expect(button.tagName).toBe('BUTTON');
      expect(button).not.toHaveAttribute('tabindex', '-1');
    });
  });
});
