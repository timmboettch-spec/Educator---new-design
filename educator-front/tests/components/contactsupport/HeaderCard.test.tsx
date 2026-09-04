import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import HeaderCard from '../../../src/components/contactsupport/HeaderCard';

vi.mock('lucide-react', () => ({
  ArrowLeft: () => <svg data-testid="icon-arrow-left" />,
  Mail: () => <svg data-testid="icon-mail" />,
  MessagesSquare: () => <svg data-testid="icon-messages-square" />,
  Phone: () => <svg data-testid="icon-phone" />,
}));

const defaultProps = {
  handleBack: vi.fn(),
  searchValue: '',
  onSearchChange: vi.fn(),
  onSearch: vi.fn(),
};

describe('HeaderCard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders SUPPORT CENTER label', () => {
    render(<HeaderCard {...defaultProps} />);
    expect(screen.getByText('SUPPORT CENTER')).toBeInTheDocument();
  });

  test('renders CUSTOMER SUPPORT heading', () => {
    render(<HeaderCard {...defaultProps} />);
    expect(screen.getByText('CUSTOMER SUPPORT')).toBeInTheDocument();
  });

  test('renders Back button', () => {
    render(<HeaderCard {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  test('calls handleBack when back button is clicked', () => {
    render(<HeaderCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(defaultProps.handleBack).toHaveBeenCalledTimes(1);
  });

  test('renders Ask a Specialist contact card', () => {
    render(<HeaderCard {...defaultProps} />);
    expect(screen.getByText('Ask a Specialist')).toBeInTheDocument();
  });

  test('renders Call Us contact card', () => {
    render(<HeaderCard {...defaultProps} />);
    expect(screen.getByText('Call Us')).toBeInTheDocument();
  });

  test('renders Email Support contact card', () => {
    render(<HeaderCard {...defaultProps} />);
    expect(screen.getByText('Email Support')).toBeInTheDocument();
  });

  test('renders search input with placeholder', () => {
    render(<HeaderCard {...defaultProps} />);
    expect(
      screen.getByPlaceholderText('Have a Question? Ask or enter a search term...'),
    ).toBeInTheDocument();
  });

  test('renders Search button', () => {
    render(<HeaderCard {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });

  test('calls onSearchChange when typing in input', () => {
    render(<HeaderCard {...defaultProps} />);
    const input = screen.getByPlaceholderText(
      'Have a Question? Ask or enter a search term...',
    );
    fireEvent.change(input, { target: { value: 'baby' } });
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith('baby');
  });

  test('calls onSearch when Search button is clicked', () => {
    render(<HeaderCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(defaultProps.onSearch).toHaveBeenCalledTimes(1);
  });

  test('calls onSearch when Enter key is pressed in input', () => {
    render(<HeaderCard {...defaultProps} />);
    const input = screen.getByPlaceholderText(
      'Have a Question? Ask or enter a search term...',
    );
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(defaultProps.onSearch).toHaveBeenCalledTimes(1);
  });

  test('does not call onSearch when non-Enter key is pressed', () => {
    render(<HeaderCard {...defaultProps} />);
    const input = screen.getByPlaceholderText(
      'Have a Question? Ask or enter a search term...',
    );
    fireEvent.keyDown(input, { key: 'a' });
    expect(defaultProps.onSearch).not.toHaveBeenCalled();
  });

  test('displays provided searchValue in input', () => {
    render(<HeaderCard {...defaultProps} searchValue="aquaponics" />);
    const input = screen.getByPlaceholderText(
      'Have a Question? Ask or enter a search term...',
    ) as HTMLInputElement;
    expect(input.value).toBe('aquaponics');
  });

  test('navigates to phone number when Call Us card is clicked', () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
    render(<HeaderCard {...defaultProps} />);
    fireEvent.click(screen.getByText('Call Us').closest('div')!);
    expect(window.location.href).toBe('tel:+18008301416');
    Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
  });

  test('navigates to email when Email Support card is clicked', () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
    render(<HeaderCard {...defaultProps} />);
    fireEvent.click(screen.getByText('Email Support').closest('div')!);
    expect(window.location.href).toBe('mailto:information@realityworks.com');
    Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
  });
});
