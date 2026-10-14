export enum SimulationStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum SimulationPatientChartMode {
  HS = 'HS',
  PS = 'PS',
}

export enum SimulationSequenceGroupsOrderMode {
  STRICT = 'strict',
  FLEXIBLE = 'flexible',
}

/** The two modalities a Simulation runs in: with an AI avatar, or without one. */
export enum LibraryModality {
  AVATAR = 'Avatar',
  WORKSTATION = 'Workstation',
}

/** The difficulties the My Library filter accepts. The data is free text and is matched ignoring case. */
export enum LibraryDifficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
}

/** The two groups a Simulation's audience text falls into. */
export enum LibraryLearnerLevel {
  SECONDARY = 'Secondary',
  POST_SECONDARY = 'Post-Secondary',
}

/**
 * The two sets of Simulations an Educator browses: the ones they saved (`my-library`) and every
 * visible one (`catalog`, the Catalogue). The values are the route segments of the dropdown routes.
 */
export enum SimulationScope {
  MY_LIBRARY = 'my-library',
  CATALOG = 'catalog',
}

/**
 * Route/Swagger/message constants for `SimulationModule`.
 *
 * Every route lives under one `simulations` base — the former
 * `simulation-catalog` prefix has been retired. `SimulationController` declares
 * `@Controller(SimulationConstants.ROUTES.BASE)`, so the values below are
 * suffixes relative to that base, not whole paths.
 *
 * Simulation-related *enums* live alongside this file in `simulation.constant.ts`.
 */
export const SimulationConstants = {
  SWAGGER: {
    TAG: 'Simulations',
  },

  ROUTES: {
    BASE: 'simulations',
    GET_ALL: '',
    GET_ALL_SIMULATION_FOR_EDUCATOR: 'educators',
    GET_COMBINED_SIMULATION: 'combined',
    GET_PUBLIC_SIMULATION: '/:scenarioId/public',
    SIMULATIONS_BY_UNIT: 'by-unit/:id',
    /** `GET simulations/target-audiences/my-library/dropdown`: audiences the filter offers for My Library. */
    TARGET_AUDIENCES_MY_LIBRARY_DROPDOWN: `target-audiences/${SimulationScope.MY_LIBRARY}/dropdown`,
    /** `GET simulations/target-audiences/catalog/dropdown`: audiences the filter offers for the Catalogue. */
    TARGET_AUDIENCES_CATALOG_DROPDOWN: `target-audiences/${SimulationScope.CATALOG}/dropdown`,
    /** `GET simulations/product-names/my-library/dropdown`: product names the filter offers for My Library. */
    PRODUCT_NAMES_MY_LIBRARY_DROPDOWN: `product-names/${SimulationScope.MY_LIBRARY}/dropdown`,
    /** `GET simulations/product-names/catalog/dropdown`: product names the filter offers for the Catalogue. */
    PRODUCT_NAMES_CATALOG_DROPDOWN: `product-names/${SimulationScope.CATALOG}/dropdown`,
  },

  VALIDATION: {
    SIMULATION_ID_REQUIRED: 'Simulation ID is required',
  },

  /** My Library list filters and title search. */
  LIBRARY_FILTER: {
    /** Longest accepted `search`, measured after trimming and collapsing whitespace. */
    SEARCH_MAX_LENGTH: 100,
    /** Most values one multi-value filter may carry. */
    MAX_VALUES_PER_FILTER: 20,
    /** Longest single value of a free-text filter. */
    MAX_VALUE_LENGTH: 255,
    /** The product name stored when a Simulation has none; it is not a product, so no dropdown offers it. */
    PLACEHOLDER_PRODUCT_NAME: 'none',
    /**
     * The `simulations_v2` columns (alias `sim` in every query that reads them) a filter compares
     * and its dropdown lists. Defined once, so a dropdown cannot offer a value its filter cannot match.
     */
    COLUMNS: {
      /** Free audience text; also what the Learner Level filter derives its level from. */
      TARGET_AUDIENCE: 'sim.learner_level',
      PRODUCT_NAME: `sim.product_setup->>'title'`,
    },
  },

  /** Which Simulations belong to a scope (`buildSimulationScopeSql`). */
  SCOPE: {
    /** Bound parameter the My Library scope reads for the Educator whose library it is. */
    EDUCATOR_PARAM: 'educatorId',
  },

  VISIBILITY: {
    /**
     * The characters `String.prototype.trim()` strips, as a regex bracket body (ASCII + Unicode),
     * so the SQL visibility rule trims the same way as `isSimulationVisibleToEducators`.
     */
    TRIMMED_WHITESPACE_CLASS:
      '[:space:]\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff',
  },

  /**
   * Default action categories backfilled by `findByUnitId` onto rows that carry
   * no `actionCategories` of their own.
   */
  ACTION_CATEGORIES: [
    { id: 'cat_actions', name: 'ACTIONS' },
    { id: 'cat_assessments', name: 'ASSESSMENTS' },
    { id: 'cat_care', name: 'CARE' },
    { id: 'cat_interventions', name: 'INTERVENTIONS' },
    { id: 'cat_tasks', name: 'TASKS' },
  ],
};
