import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { store } from '../../../src/store';
import { classesApi } from '../../../src/redux/api/classes/classesApi';
import { ClassAttentionMeasure } from '../../../src/redux/api/classes/classes.types';
import { ActivityOverview } from '../../../src/components/dashboard/ActivityOverview';
import { renderWithProviders } from '../../../src/test/testUtils';
import i18n from '../../../src/i18n';

const renderOverview = (onTileClick = vi.fn()) => {
  renderWithProviders(<ActivityOverview onTileClick={onTileClick} />);
  return onTileClick;
};

const respondWith = (data: Record<string, number>) =>
  apiRequest.mockResolvedValue({ data: { message: 'ok', data } });

const allOutstanding = {
  activeClasses: 555,
  classesWithUnreadReports: 2,
  totalUnreadReports: 7,
  classesClosingSoon: 554,
  studentsInActiveClasses: 961,
  classesWithStudentsNearAvatarLimit: 3,
};

const LABELS_IN_ORDER = [
  'Active Classes',
  'Students in Active Classes',
  'Classes with Unread Reports',
  'Total Unread Reports',
  'Classes Closing (14 Days)',
  'Classes w/ Students Near Avatar Limit',
];

const tileButton = (label: string) =>
  screen.getByRole('button', { name: `${label} — view classes` });

describe('ActivityOverview', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    // renderWithProviders uses the app store; clear cached query results between tests.
    store.dispatch(classesApi.util.resetApiState());
  });

  it('announces loading while the overview is fetched', () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    renderOverview();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading activity overview…'
    );
  });

  it('shows all six measures with their BE counts in row order', async () => {
    respondWith(allOutstanding);
    renderOverview();

    await screen.findByText('Active Classes');
    expect(
      screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    ).toEqual(LABELS_IN_ORDER.map((l) => `${l} — view classes`));
    expect(
      within(tileButton('Students in Active Classes')).getByText('961')
    ).toBeInTheDocument();
    expect(
      within(tileButton('Classes w/ Students Near Avatar Limit')).getByText('3')
    ).toBeInTheDocument();
  });

  it('shows the tiles in Spanish from the dashboard namespace', async () => {
    await i18n.changeLanguage('es');
    try {
      respondWith(allOutstanding);
      renderOverview();

      expect(await screen.findByText('Clases activas')).toBeInTheDocument();
      expect(screen.getByText('Resumen de actividad')).toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Estudiantes en clases activas — ver clases',
        })
      ).toBeInTheDocument();
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('still shows a measure with nothing outstanding, as 0', async () => {
    respondWith({
      ...allOutstanding,
      classesWithUnreadReports: 0,
      totalUnreadReports: 0,
      classesWithStudentsNearAvatarLimit: 0,
    });
    renderOverview();

    await screen.findByText('Active Classes');
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(tileButton('Total Unread Reports')).toHaveTextContent('0');
    expect(
      tileButton('Classes w/ Students Near Avatar Limit')
    ).toHaveTextContent('0');
  });

  it('shows every tile at 0 when nothing is outstanding', async () => {
    respondWith({
      activeClasses: 0,
      classesWithUnreadReports: 0,
      totalUnreadReports: 0,
      classesClosingSoon: 0,
      studentsInActiveClasses: 0,
      classesWithStudentsNearAvatarLimit: 0,
    });
    renderOverview();

    expect(await screen.findByText('Activity Overview')).toBeInTheDocument();
    await screen.findByText('Active Classes');
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(
      screen.getAllByRole('button').every((b) => b.textContent?.includes('0'))
    ).toBe(true);
  });

  it.each([
    ['Active Classes', ClassAttentionMeasure.ACTIVE],
    ['Students in Active Classes', ClassAttentionMeasure.ACTIVE],
    ['Classes with Unread Reports', ClassAttentionMeasure.UNREAD_REPORTS],
    ['Total Unread Reports', ClassAttentionMeasure.UNREAD_REPORTS],
    ['Classes Closing (14 Days)', ClassAttentionMeasure.CLOSING_SOON],
    [
      'Classes w/ Students Near Avatar Limit',
      ClassAttentionMeasure.NEAR_AVATAR_LIMIT,
    ],
  ])('%s opens the class list filtered to %s', async (label, measure) => {
    respondWith(allOutstanding);
    const onTileClick = renderOverview();

    await screen.findByText('Active Classes');
    fireEvent.click(tileButton(label));
    expect(onTileClick).toHaveBeenCalledWith(measure);
  });

  it('shows a friendly error when the request fails', async () => {
    apiRequest.mockRejectedValue({ response: { status: 500, data: 'boom' } });
    renderOverview();
    expect(
      await screen.findByText(
        "We couldn't load your activity overview right now."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});
