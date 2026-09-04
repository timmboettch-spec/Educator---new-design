import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import CustomerSupport from '../../../src/pages/customersupport/index';

// ── child component mocks ──────────────────────────────────────────────────
vi.mock('../../../src/components/contactsupport/HeaderCard', () => ({
  default: ({
    handleBack,
    searchValue,
    onSearchChange,
    onSearch,
  }: {
    handleBack: () => void;
    searchValue: string;
    onSearchChange: (v: string) => void;
    onSearch: () => void;
  }) => (
    <div data-testid="header-card">
      <button onClick={handleBack}>Back to catalog</button>
      <input
        data-testid="search-input"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search"
      />
      <button onClick={onSearch} data-testid="search-btn">
        Search
      </button>
    </div>
  ),
}));

vi.mock('../../../src/components/contactsupport/SupportList', () => ({
  default: ({
    header,
    listItem,
  }: {
    header: string;
    headerIcon?: string;
    listItem: string[];
  }) => (
    <div data-testid={`support-list-${header}`}>
      <h3>{header}</h3>
      {listItem.map((item: string) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  ),
}));

vi.mock('../../../src/components/contactsupport/VideoFooter', () => ({
  default: () => <div data-testid="video-footer">VideoFooter</div>,
}));

vi.mock('../../../src/components/common/Footer', () => ({
  default: () => <footer data-testid="footer">Footer</footer>,
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: vi.fn() };
});

const mockNavigate = vi.fn();

const renderPage = () => {
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  return render(
    <MemoryRouter>
      <CustomerSupport />
    </MemoryRouter>,
  );
};

describe('CustomerSupport Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders HeaderCard', () => {
    renderPage();
    expect(screen.getByTestId('header-card')).toBeInTheDocument();
  });

  test('renders VideoFooter', () => {
    renderPage();
    expect(screen.getByTestId('video-footer')).toBeInTheDocument();
  });

  test('renders Footer', () => {
    renderPage();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  test('renders support list sections from supportData', () => {
    renderPage();
    // At least one section should render
    expect(screen.getByText('Agriculture')).toBeInTheDocument();
  });

  test('calls navigate(-1) when back button is clicked', () => {
    renderPage();
    fireEvent.click(screen.getByText('Back to catalog'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  test('filters support sections when a search query is entered and Search is clicked', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'Aquaponics' },
    });
    fireEvent.click(screen.getByTestId('search-btn'));
    expect(screen.getByText('Aquaponics')).toBeInTheDocument();
  });

  test('shows no-results message when search has no match', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'xyznonexistent' },
    });
    fireEvent.click(screen.getByTestId('search-btn'));
    expect(
      screen.getByText(/No results found for "xyznonexistent"/),
    ).toBeInTheDocument();
  });

  test('restores all sections when search is cleared and re-submitted', () => {
    renderPage();
    // Search for something
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'Aquaponics' },
    });
    fireEvent.click(screen.getByTestId('search-btn'));
    // Clear and re-search
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('search-btn'));
    expect(screen.getByText('Agriculture')).toBeInTheDocument();
  });

  test('search filtering is case-insensitive', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'aquaponics' },
    });
    fireEvent.click(screen.getByTestId('search-btn'));
    expect(screen.getByText('Aquaponics')).toBeInTheDocument();
  });

  test('trims whitespace from search input before filtering', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: '  Aquaponics  ' },
    });
    fireEvent.click(screen.getByTestId('search-btn'));
    expect(screen.getByText('Aquaponics')).toBeInTheDocument();
  });
});
