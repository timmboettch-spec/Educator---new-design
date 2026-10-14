import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/testUtils';
import i18n from '@/i18n';
import * as useAdminSetupProgressModule from '@/hooks/useAdminSetupProgress';
import AdminSetupTracker from './AdminSetupTracker';

const mockNavigate = vi.fn();

vi.mock('@/hooks/useAdminSetupProgress');
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

const STEP_ROUTES = [
  ['lms', '/lms-integration'],
  ['schools', '/schools'],
  ['educators', '/educators'],
  ['account', '/account'],
] as const;

const doneSteps = (count: number) =>
  STEP_ROUTES.map(([key, route], i) => ({
    key,
    index: i + 1,
    route,
    done: i < count,
  }));

const mockProgress = (
  overrides: Partial<
    ReturnType<typeof useAdminSetupProgressModule.useAdminSetupProgress>
  > = {}
) => {
  vi.mocked(useAdminSetupProgressModule.useAdminSetupProgress).mockReturnValue({
    eligible: true,
    status: 'ready',
    visible: true,
    steps: doneSteps(0),
    completedCount: 0,
    totalSteps: 4,
    currentIndex: 1,
    allGatesDone: false,
    dismiss: vi.fn(),
    retry: vi.fn(),
    skipLms: vi.fn(),
    ...overrides,
  });
};

const allDone = {
  steps: doneSteps(4),
  completedCount: 4,
  currentIndex: 5,
  allGatesDone: true,
};

const detailPanel = () =>
  screen.getByText(/^(STEP|PASO) \d ·/).parentElement as HTMLElement;

describe('AdminSetupTracker', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await act(() => i18n.changeLanguage('en'));
  });

  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('renders the admin guide header and progress', () => {
    mockProgress();
    renderWithProviders(<AdminSetupTracker />);

    expect(
      screen.getByText('Account and Organization Set Up Guide')
    ).toBeInTheDocument();
    expect(screen.getByText('0 of 4 steps complete')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Setup progress' })
    ).toHaveAttribute('aria-valuemax', '4');
  });

  it('opens on the LMS step with set-up and skip actions', () => {
    const skipLms = vi.fn();
    mockProgress({ skipLms });
    renderWithProviders(<AdminSetupTracker />);

    expect(
      screen.getByText('STEP 1 · CONFIGURE LMS INTEGRATION (if applicable)')
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Set up LMS integration' })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/lms-integration');

    fireEvent.click(
      screen.getByRole('button', { name: 'Skip this, we’re not doing it' })
    );
    expect(skipLms).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('labels each stone "Step N", with the number as its own text node', async () => {
    mockProgress();
    renderWithProviders(<AdminSetupTracker />);

    const caption = screen.getByText('Step 3');
    // Two nodes, as the design renders `Step {index}` (affects glyph shaping).
    expect(caption.childNodes).toHaveLength(2);

    await act(() => i18n.changeLanguage('es'));
    expect(screen.getByText('Paso 3')).toBeInTheDocument();
  });

  it('renders step instructions as a paragraph, not bullets', () => {
    mockProgress();
    renderWithProviders(<AdminSetupTracker />);

    expect(within(detailPanel()).queryByRole('list')).not.toBeInTheDocument();
  });

  it('drops the skip action once LMS is done', () => {
    mockProgress({ steps: doneSteps(1), completedCount: 1, currentIndex: 2 });
    renderWithProviders(<AdminSetupTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Step 1 (done)' }));

    expect(
      screen.queryByRole('button', { name: 'Skip this, we’re not doing it' })
    ).not.toBeInTheDocument();
  });

  it.each([
    ['Step 2', 'Go to Schools', '/schools'],
    ['Step 3', 'Go to Educators', '/educators'],
    ['Step 4', 'Go to Account', '/account'],
  ])('%s navigates with "%s"', (stone, cta, route) => {
    mockProgress();
    renderWithProviders(<AdminSetupTracker />);

    fireEvent.click(screen.getByRole('button', { name: stone }));
    fireEvent.click(screen.getByRole('button', { name: cta }));

    expect(mockNavigate).toHaveBeenCalledWith(route);
  });

  it('Finish links to the dashboard only, with no Products button', () => {
    mockProgress();
    renderWithProviders(<AdminSetupTracker />);

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.getByText('STEP 5 · FINISH')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Dashboard' }));
    expect(mockNavigate).toHaveBeenCalledWith('/admin-dashboard');
    expect(
      screen.queryByRole('button', { name: /products/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Got it — hide this guide' })
    ).not.toBeInTheDocument();
  });

  it('offers to hide the guide once every step is done', () => {
    const dismiss = vi.fn();
    mockProgress({ ...allDone, dismiss });
    renderWithProviders(<AdminSetupTracker />);

    expect(screen.getByText('Your organization is set up')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Got it — hide this guide' })
    );
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('translates to Spanish', async () => {
    mockProgress();
    renderWithProviders(<AdminSetupTracker />);

    await act(() => i18n.changeLanguage('es'));

    expect(
      screen.getByText('Guía de Configuración de la Cuenta y la Organización')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Omitir, no lo haremos' })
    ).toBeInTheDocument();
  });

  it('shows the shared loading and unavailable states', () => {
    mockProgress({ status: 'loading', visible: false });
    const { unmount } = renderWithProviders(<AdminSetupTracker />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    unmount();

    const retry = vi.fn();
    mockProgress({ status: 'error', visible: false, retry });
    renderWithProviders(<AdminSetupTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when hidden', () => {
    mockProgress({ status: 'hidden', visible: false });
    const { container } = renderWithProviders(<AdminSetupTracker />);

    expect(container).toBeEmptyDOMElement();
  });

  it('collapses the panel from the header toggle', () => {
    mockProgress();
    renderWithProviders(<AdminSetupTracker />);

    const toggle = screen.getByRole('button', { name: /collapse/i });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: 'Set up LMS integration' })
    ).not.toBeInTheDocument();
  });
});
