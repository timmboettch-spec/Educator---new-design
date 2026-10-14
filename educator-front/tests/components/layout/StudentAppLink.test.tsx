import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../src/i18n';
import { StudentAppLink } from '../../../src/components/layout/StudentAppLink';
import { toast } from '../../../src/components/common/Toast';
import { STUDENT_APP_URL } from '../../../src/utils/constants/studentApp';

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const writeText = vi.fn<(text: string) => Promise<void>>();

const renderLink = (collapsed = false) => {
  const onShowTooltip = vi.fn();
  const onHideTooltip = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <StudentAppLink
        collapsed={collapsed}
        onShowTooltip={onShowTooltip}
        onHideTooltip={onHideTooltip}
      />
    </I18nextProvider>
  );
  return { onShowTooltip, onHideTooltip };
};

describe('StudentAppLink', () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  test('shows the student app URL as an external link', () => {
    renderLink();
    expect(screen.getByText('Student App')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: STUDENT_APP_URL });
    expect(link).toHaveAttribute('href', STUDENT_APP_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('copies the URL and confirms it', async () => {
    renderLink();
    const button = screen.getByRole('button', {
      name: 'Copy student app link',
    });
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledWith(STUDENT_APP_URL);
    await waitFor(() => expect(button).toHaveAttribute('title', 'Copied!'));
  });

  test('tells the user when the clipboard is unavailable', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    renderLink();
    const button = screen.getByRole('button', {
      name: 'Copy student app link',
    });
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not copy the link')
    );
    expect(button).toHaveAttribute('title', 'Copy link');
  });

  test('clears the copied state when a later copy fails', async () => {
    renderLink();
    const button = screen.getByRole('button', {
      name: 'Copy student app link',
    });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('title', 'Copied!'));

    writeText.mockRejectedValue(new Error('revoked'));
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('title', 'Copy link'));
  });

  test('collapsed: renders only an icon link that shows a tooltip on hover', () => {
    const { onShowTooltip, onHideTooltip } = renderLink(true);
    expect(screen.queryByText('Student App')).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Open the student app' });
    expect(link).toHaveAttribute('href', STUDENT_APP_URL);

    fireEvent.mouseEnter(link.parentElement as HTMLElement);
    expect(onShowTooltip).toHaveBeenCalledWith(
      'Student App',
      link.parentElement
    );
    fireEvent.mouseLeave(link.parentElement as HTMLElement);
    expect(onHideTooltip).toHaveBeenCalled();
  });
});
