import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../../src/i18n';

describe('count-based labels use singular and plural forms', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('Spanish selection count agrees in number', async () => {
    await i18n.changeLanguage('es');
    const t = i18n.getFixedT('es', 'simulationLibrary');
    expect(t('selection.selected', { count: 1 })).toBe('1 seleccionada');
    expect(t('selection.selected', { count: 3 })).toBe('3 seleccionadas');
    expect(t('selection.selected', { count: 0 })).toBe('0 seleccionadas');
  });

  it('Spanish filter-button count agrees in number', async () => {
    await i18n.changeLanguage('es');
    const t = i18n.getFixedT('es', 'common');
    expect(t('filterButton.openWithCount', { count: 1 })).toBe(
      'Filtros, 1 aplicado'
    );
    expect(t('filterButton.openWithCount', { count: 2 })).toBe(
      'Filtros, 2 aplicados'
    );
  });

  it('English wording is unchanged', () => {
    const lib = i18n.getFixedT('en', 'simulationLibrary');
    const common = i18n.getFixedT('en', 'common');
    expect(lib('selection.selected', { count: 1 })).toBe('1 selected');
    expect(common('filterButton.openWithCount', { count: 1 })).toBe(
      'Filters, 1 applied'
    );
  });
});
