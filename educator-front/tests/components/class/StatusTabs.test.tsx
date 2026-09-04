import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StatusTabs from '../../../src/components/class/StatusTabs';

const ALL_TABS = ['All', 'Active', 'Need Attention', 'Draft', 'Archived'];

describe('StatusTabs – rendering', () => {
  it('renders all 5 tab buttons', () => {
    render(<StatusTabs activeTab="all" onChange={vi.fn()} />);
    ALL_TABS.forEach((tab) => expect(screen.getByText(tab)).toBeInTheDocument());
  });

  it('defaults to All tab active on first render', () => {
    render(<StatusTabs activeTab="all" onChange={vi.fn()} />);
    expect(screen.getByText('All')).toHaveClass('bg-orange-500');
  });

  it('non-active tabs do not have orange background', () => {
    render(<StatusTabs activeTab="all" onChange={vi.fn()} />);
    ['Active', 'Need Attention', 'Draft', 'Archived'].forEach((tab) => {
      expect(screen.getByText(tab)).not.toHaveClass('bg-orange-500');
    });
  });
});

describe('StatusTabs – interaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls onChange with correct tab when Active clicked', () => {
    const onChange = vi.fn();
    render(<StatusTabs activeTab="all" onChange={onChange} />);
    fireEvent.click(screen.getByText('Active'));
    expect(onChange).toHaveBeenCalledWith('active');
  });

  it('calls onChange with correct tab when Draft clicked', () => {
    const onChange = vi.fn();
    render(<StatusTabs activeTab="all" onChange={onChange} />);
    fireEvent.click(screen.getByText('Draft'));
    expect(onChange).toHaveBeenCalledWith('draft');
  });

  it('calls onChange with correct tab when Archived clicked', () => {
    const onChange = vi.fn();
    render(<StatusTabs activeTab="all" onChange={onChange} />);
    fireEvent.click(screen.getByText('Archived'));
    expect(onChange).toHaveBeenCalledWith('archived');
  });

  it('calls onChange with correct tab when Need Attention clicked', () => {
    const onChange = vi.fn();
    render(<StatusTabs activeTab="all" onChange={onChange} />);
    fireEvent.click(screen.getByText('Need Attention'));
    expect(onChange).toHaveBeenCalledWith('needAttention');
  });

  it('calls onChange with All when All tab clicked', () => {
    const onChange = vi.fn();
    render(<StatusTabs activeTab="all" onChange={onChange} />);
    fireEvent.click(screen.getByText('All'));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('updates active tab styling when activeTab prop changes', () => {
    const { rerender } = render(<StatusTabs activeTab="all" onChange={vi.fn()} />);
    rerender(<StatusTabs activeTab="draft" onChange={vi.fn()} />);
    expect(screen.getByText('Draft')).toHaveClass('bg-orange-500');
    expect(screen.getByText('All')).not.toHaveClass('bg-orange-500');
  });

  it('calls onChange exactly once per click', () => {
    const onChange = vi.fn();
    render(<StatusTabs activeTab="all" onChange={onChange} />);
    fireEvent.click(screen.getByText('Active'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('switches active tab correctly across prop updates', () => {
    const { rerender } = render(<StatusTabs activeTab="all" onChange={vi.fn()} />);
    rerender(<StatusTabs activeTab="active" onChange={vi.fn()} />);
    expect(screen.getByText('Active')).toHaveClass('bg-orange-500');
    rerender(<StatusTabs activeTab="archived" onChange={vi.fn()} />);
    expect(screen.getByText('Archived')).toHaveClass('bg-orange-500');
    expect(screen.getByText('Active')).not.toHaveClass('bg-orange-500');
  });
});
