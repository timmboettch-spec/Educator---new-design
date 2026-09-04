import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import SupportList from '../../../src/components/contactsupport/SupportList';

vi.mock('lucide-react', () => ({
  CircleCheck: () => <svg data-testid="icon-circle-check" />,
  ChevronDown: () => <svg data-testid="icon-chevron-down" />,
  ChevronUp: () => <svg data-testid="icon-chevron-up" />,
}));

const shortList = ['Item A', 'Item B', 'Item C'];
const longList = [
  'Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6', 'Item 7',
];

describe('SupportList Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders header when provided', () => {
    render(<SupportList header="Agriculture" listItem={shortList} />);
    expect(screen.getByText('Agriculture')).toBeInTheDocument();
  });

  test('does not render header section when neither header nor headerIcon is provided', () => {
    render(<SupportList listItem={shortList} />);
    expect(screen.queryByText('Agriculture')).not.toBeInTheDocument();
  });

  test('renders headerIcon when provided', () => {
    render(<SupportList header="Agriculture" headerIcon="/agri.svg" listItem={shortList} />);
    const img = screen.getByAltText('Agriculture');
    expect(img).toHaveAttribute('src', '/agri.svg');
  });

  test('renders all items when list has 5 or fewer items', () => {
    render(<SupportList listItem={shortList} />);
    shortList.forEach((item) => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });

  test('renders only first 5 items by default when list is longer than 5', () => {
    render(<SupportList listItem={longList} />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 5')).toBeInTheDocument();
    expect(screen.queryByText('Item 6')).not.toBeInTheDocument();
    expect(screen.queryByText('Item 7')).not.toBeInTheDocument();
  });

  test('shows "Show all articles" button when list has more than 5 items', () => {
    render(<SupportList listItem={longList} />);
    expect(screen.getByText(`Show all articles (${longList.length})`)).toBeInTheDocument();
  });

  test('does not show "Show all" button when list has 5 or fewer items', () => {
    render(<SupportList listItem={shortList} />);
    expect(screen.queryByText(/Show all articles/)).not.toBeInTheDocument();
  });

  test('shows all items after clicking "Show all articles"', () => {
    render(<SupportList listItem={longList} />);
    fireEvent.click(screen.getByText(`Show all articles (${longList.length})`));
    longList.forEach((item) => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });

  test('shows "Show Less" button after expanding', () => {
    render(<SupportList listItem={longList} />);
    fireEvent.click(screen.getByText(`Show all articles (${longList.length})`));
    expect(screen.getByText('Show Less')).toBeInTheDocument();
  });

  test('collapses back to 5 items after clicking "Show Less"', () => {
    render(<SupportList listItem={longList} />);
    fireEvent.click(screen.getByText(`Show all articles (${longList.length})`));
    fireEvent.click(screen.getByText('Show Less'));
    expect(screen.queryByText('Item 6')).not.toBeInTheDocument();
    expect(screen.queryByText('Item 7')).not.toBeInTheDocument();
  });

  test('renders a CircleCheck icon for each visible item', () => {
    render(<SupportList listItem={shortList} />);
    const icons = screen.getAllByTestId('icon-circle-check');
    expect(icons).toHaveLength(shortList.length);
  });
});
