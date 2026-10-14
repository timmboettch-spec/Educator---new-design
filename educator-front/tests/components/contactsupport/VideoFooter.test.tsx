import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import VideoFooter from '../../../src/components/contactsupport/VideoFooter';

vi.mock('../../../../public/assets/contactsupport/PlayVideo.svg', () => ({
  default: '/assets/contactsupport/PlayVideo.svg',
}));

describe('VideoFooter Component', () => {
  test('renders the embedded YouTube iframe', () => {
    render(<VideoFooter />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/XGTUqYHnlEY'
    );
  });

  test('iframe has correct title attribute', () => {
    render(<VideoFooter />);
    expect(screen.getByTitle('YouTube video player')).toBeInTheDocument();
  });

  test('renders "Most Viewed Videos" heading', () => {
    render(<VideoFooter />);
    expect(screen.getByText('Most Viewed Videos')).toBeInTheDocument();
  });

  test('renders all four video links', () => {
    render(<VideoFooter />);
    expect(
      screen.getByText('Blood Pressure Simulator Tutorial')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Animal Science - Chicken Model')
    ).toBeInTheDocument();
    expect(screen.getByText('guideWELD LIVE intro')).toBeInTheDocument();
    expect(screen.getByText('Electrical Wiring Kit Intro')).toBeInTheDocument();
  });

  test('each video link opens in a new tab with correct href', () => {
    render(<VideoFooter />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    links.forEach((link) => {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.youtube\.com/);
    });
  });

  test('renders Play Video icons for each video', () => {
    render(<VideoFooter />);
    const icons = screen.getAllByAltText('Play Video');
    expect(icons).toHaveLength(4);
  });
});
