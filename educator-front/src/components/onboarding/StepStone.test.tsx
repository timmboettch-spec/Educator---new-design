import { render, screen } from '@testing-library/react';
import { StepStone, type StoneKind } from './StepStone';

const renderStone = (kind: StoneKind, isSelected: boolean) =>
  render(
    <StepStone
      kind={kind}
      label="Caption"
      state="upcoming"
      icon={1}
      isSelected={isSelected}
      ariaLabel="Stone"
      onSelect={() => {}}
      hasConnector={false}
      connectorActive={false}
    />
  );

describe('StepStone caption weight (matches the approved design)', () => {
  it.each([
    ['start', false, 'font-semibold'],
    ['start', true, 'font-bold'],
    ['step', false, 'font-medium'],
    ['step', true, 'font-bold'],
    // Finish keeps its weight when selected.
    ['finish', false, 'font-medium'],
    ['finish', true, 'font-medium'],
  ] as const)('%s, selected=%s → %s', (kind, isSelected, weight) => {
    renderStone(kind, isSelected);
    const caption = screen.getByText('Caption');

    expect(caption).toHaveClass(weight);
    ['font-medium', 'font-semibold', 'font-bold']
      .filter((w) => w !== weight)
      .forEach((w) => expect(caption).not.toHaveClass(w));
  });

  it('only the Start caption is not text-selectable', () => {
    const { unmount } = renderStone('start', false);
    expect(screen.getByText('Caption')).toHaveClass('select-none');
    unmount();

    renderStone('step', false);
    expect(screen.getByText('Caption')).not.toHaveClass('select-none');
  });
});
