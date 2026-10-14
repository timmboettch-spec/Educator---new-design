import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../../src/i18n';
import {
  ClassListAnnouncer,
  type ClassListAnnouncerProps,
} from '../../../src/components/class/ClassListAnnouncer';

const baseProps: ClassListAnnouncerProps = {
  resultCount: undefined,
  sortField: null,
  sortDirection: null,
};

const statusTexts = () =>
  screen.getAllByRole('status').map((region) => region.textContent);

describe('ClassListAnnouncer', () => {
  it('says nothing while the result count loads and nothing is sorted', () => {
    render(<ClassListAnnouncer {...baseProps} />);
    expect(statusTexts()).toEqual(['', '']);
  });

  it.each([
    [1, '1 class found'],
    [4, '4 classes found'],
    [0, '0 classes found'],
  ])('announces %i results', (count, text) => {
    render(<ClassListAnnouncer {...baseProps} resultCount={count} />);
    expect(statusTexts()).toContain(text);
  });

  it('announces the sort column and direction, then that sorting was cleared', () => {
    const { rerender } = render(
      <ClassListAnnouncer
        {...baseProps}
        sortField="class_name"
        sortDirection="asc"
      />
    );
    expect(statusTexts()).toContain('Sorted by Class Name, ascending');

    rerender(
      <ClassListAnnouncer
        {...baseProps}
        sortField="class_name"
        sortDirection="desc"
      />
    );
    expect(statusTexts()).toContain('Sorted by Class Name, descending');

    rerender(<ClassListAnnouncer {...baseProps} />);
    expect(statusTexts()).toContain('Sorting cleared');
  });
});
