import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthLanguageSwitcher } from '@/components/auth/AuthLanguageSwitcher';

const renderSwitcher = (language: 'en' | 'es', onChange = vi.fn()) => {
  render(
    <AuthLanguageSwitcher
      language={language}
      onChange={onChange}
      label="Language"
      englishLabel="English"
      spanishLabel="Español"
    />
  );
  return onChange;
};

describe('AuthLanguageSwitcher', () => {
  it('renders the label and both options', () => {
    renderSwitcher('en');
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Español' })).toBeInTheDocument();
  });

  it('marks only the active language as pressed', () => {
    renderSwitcher('es');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Español' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('reports the chosen language', () => {
    const onChange = renderSwitcher('en');
    fireEvent.click(screen.getByRole('button', { name: 'Español' }));
    expect(onChange).toHaveBeenCalledWith('es');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(onChange).toHaveBeenCalledWith('en');
  });
});
