import { SimulationScope } from './simulation.constants';

export enum UnitCategory {
  AI_ONLY = 'AI Only',
  MANIKIN = 'Manikin',
  TRAINER = 'Trainer',
}

export const UnitConstants = {
  SWAGGER: {
    TAG: 'Units',
  },
  ROUTES: {
    BASE: 'units',
    DROPDOWN: 'dropdown',
    /** `GET units/my-library/dropdown`: the Units the Unit filter offers for My Library. */
    MY_LIBRARY_DROPDOWN: `${SimulationScope.MY_LIBRARY}/dropdown`,
    /** `GET units/catalog/dropdown`: the Units the Unit filter offers for the Catalogue. */
    CATALOG_DROPDOWN: `${SimulationScope.CATALOG}/dropdown`,
  },
  VALIDATION: {
    ID_MAX_LENGTH: 32,
    ID_PATTERN: /^[a-zA-Z0-9-_\s]+$/,
    NAME_MAX_LENGTH: 48,
    NAME_PATTERN: /^[a-zA-Z0-9\s]+$/,
  },
  DROPDOWN: {
    DEFAULT_PAGE_SIZE: 100,
    MAX_PAGE_SIZE: 500,
  },
};
