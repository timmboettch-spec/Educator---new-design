import { describe, expect, it } from 'vitest';
import type { SectionItem } from '../../../src/redux/simulation/FetchSimulationCatalogRedux';
import {
  buildSimPacks,
  groupByUnit,
  isCatalogView,
} from '../../../src/utils/catalogViews';

const item = (overrides: Partial<SectionItem>): SectionItem => ({
  id: 1,
  title: 'Sim',
  image: '',
  cta: 'View',
  ...overrides,
});

describe('isCatalogView', () => {
  it('accepts only the four catalogue views', () => {
    expect(isCatalogView('packs')).toBe(true);
    expect(isCatalogView('units')).toBe(true);
    expect(isCatalogView('audiences')).toBe(false);
    expect(isCatalogView(null)).toBe(false);
  });
});

describe('buildSimPacks', () => {
  const sims = [
    item({ id: 1, targetAudience: ['High School'], avatarEnabled: true }),
    item({ id: 2, targetAudience: ['High School'] }),
    item({ id: 3, targetAudience: ['BSN'], avatarEnabled: true }),
    item({ id: 4, targetAudience: ['BSN'], avatarEnabled: false }),
    item({ id: 5 }),
  ];

  it('always builds the four level × modality packs, in design order', () => {
    expect(
      buildSimPacks([]).map((pack) => `${pack.level} ${pack.modality}`)
    ).toEqual([
      'Secondary Avatar',
      'Secondary Workstation',
      'Post-Secondary Avatar',
      'Post-Secondary Workstation',
    ]);
  });

  it('puts each simulation in the pack matching its level and modality', () => {
    const ids = buildSimPacks(sims).map((pack) =>
      pack.sims.map((sim) => sim.id)
    );
    expect(ids).toEqual([[1], [2], [3], [4]]);
  });

  it('leaves out simulations with no learner level', () => {
    const packed = buildSimPacks(sims).flatMap((pack) => pack.sims);
    expect(packed.map((sim) => sim.id)).not.toContain(5);
  });
});

describe('groupByUnit', () => {
  const names: Record<string, string> = { u1: 'Cardiology', u2: 'Burns' };
  const resolve = (sim: SectionItem) => names[sim.unit ?? ''] ?? '';

  it('groups by unit display name in first-seen order', () => {
    const groups = groupByUnit(
      [
        item({ id: 1, unit: 'u2' }),
        item({ id: 2, unit: 'u1' }),
        item({ id: 3, unit: 'u2' }),
      ],
      resolve
    );
    expect(groups.map((g) => [g.name, g.sims.map((sim) => sim.id)])).toEqual([
      ['Burns', [1, 3]],
      ['Cardiology', [2]],
    ]);
  });

  it('leaves out simulations with no unit', () => {
    expect(groupByUnit([item({ id: 1 })], resolve)).toEqual([]);
  });
});
