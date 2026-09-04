import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';
import Footer from '../../../src/components/common/Footer';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: vi.fn(),
    useLocation: vi.fn(),
  };
});

const mockNavigate = vi.fn();

const renderFooter = (pathname = '/') => {
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  vi.mocked(useLocation).mockReturnValue({
    pathname,
    search: '',
    hash: '',
    state: null,
    key: 'default',
  } as ReturnType<typeof useLocation>);
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
};

describe('Footer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders the company logo', () => {
    renderFooter();
    expect(screen.getByAltText(/logo/i)).toBeInTheDocument();
  });

  test('renders COMPANY section heading', () => {
    renderFooter();
    expect(screen.getByText('COMPANY')).toBeInTheDocument();
  });

  test('renders HELP section heading', () => {
    renderFooter();
    expect(screen.getByText('HELP')).toBeInTheDocument();
  });

  test('renders all company links', () => {
    renderFooter();
    expect(screen.getByText('Simulation Catalog')).toBeInTheDocument();
    expect(screen.getByText('My Simulations')).toBeInTheDocument();
  });

  test('renders all help links', () => {
    renderFooter();
    expect(screen.getByText('Customer Support')).toBeInTheDocument();
    expect(screen.getByText('Terms & Conditions')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  test('renders copyright text', () => {
    renderFooter();
    expect(
      screen.getByText('© Copyright 2026, All Rights Reserved by Realityworks AI'),
    ).toBeInTheDocument();
  });

  test('renders social media buttons', () => {
    renderFooter();
    expect(screen.getByLabelText('Twitter')).toBeInTheDocument();
    expect(screen.getByLabelText('Facebook')).toBeInTheDocument();
    expect(screen.getByLabelText('Instagram')).toBeInTheDocument();
    expect(screen.getByLabelText('LinkedIn')).toBeInTheDocument();
  });

  test('Twitter button opens correct URL in new tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderFooter();
    fireEvent.click(screen.getByLabelText('Twitter'));
    expect(openSpy).toHaveBeenCalledWith('https://x.com/RealityworksInc', '_blank');
    openSpy.mockRestore();
  });

  test('Facebook button opens correct URL in new tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderFooter();
    fireEvent.click(screen.getByLabelText('Facebook'));
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.facebook.com/realityworksinc',
      '_blank',
    );
    openSpy.mockRestore();
  });

  test('Instagram button opens correct URL in new tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderFooter();
    fireEvent.click(screen.getByLabelText('Instagram'));
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.instagram.com/realityworksofficial',
      '_blank',
    );
    openSpy.mockRestore();
  });

  test('LinkedIn button opens correct URL in new tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderFooter();
    fireEvent.click(screen.getByLabelText('LinkedIn'));
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.linkedin.com/company/realityworks',
      '_blank',
    );
    openSpy.mockRestore();
  });

  test('clicking a nav link on same page scrolls to top instead of navigating', () => {
    const scrollTo = vi.fn();
    const mockMain = { scrollTo };
    vi.spyOn(document, 'querySelector').mockImplementation((sel) => {
      if (sel === 'main.overflow-y-auto') return mockMain as unknown as Element;
      return null;
    });
    renderFooter('/simulation-catalog');
    fireEvent.click(screen.getByText('Simulation Catalog'));
    expect(mockMain.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  test('Customer Support link points to correct path', () => {
    renderFooter('/');
    const link = screen.getByText('Customer Support').closest('a');
    expect(link).toHaveAttribute('href', '/customersupport');
  });
});
