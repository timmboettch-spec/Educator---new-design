import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileAvatar } from '@/components/account/ProfileAvatar';

describe('ProfileAvatar', () => {
  it('shows the initial when there is no photo', () => {
    render(<ProfileAvatar imageUrl="" initial="S" isBusy={false} />);
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('falls back to the initial when the photo fails to load', () => {
    const { container } = render(
      <ProfileAvatar
        imageUrl="https://cdn/broken.png"
        initial="S"
        isBusy={false}
      />
    );
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('tries a new photo after an earlier one failed', () => {
    const { container, rerender } = render(
      <ProfileAvatar
        imageUrl="https://cdn/broken.png"
        initial="S"
        isBusy={false}
      />
    );
    fireEvent.error(container.querySelector('img')!);

    rerender(
      <ProfileAvatar
        imageUrl="https://cdn/new.png"
        initial="S"
        isBusy={false}
      />
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn/new.png'
    );
  });

  it('retries the same address after a profile change, for a re-uploaded photo', () => {
    const { container } = render(
      <ProfileAvatar
        imageUrl="https://cdn/avatar.png"
        initial="S"
        isBusy={false}
      />
    );
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('profile-updated'));
    });
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn/avatar.png'
    );
  });

  it('shows the busy overlay only while busy', () => {
    const { rerender } = render(
      <ProfileAvatar imageUrl="" initial="S" isBusy />
    );
    expect(screen.getByTestId('profile-photo-busy')).toBeInTheDocument();

    rerender(<ProfileAvatar imageUrl="" initial="S" isBusy={false} />);
    expect(screen.queryByTestId('profile-photo-busy')).not.toBeInTheDocument();
  });
});
