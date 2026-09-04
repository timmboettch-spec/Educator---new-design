export const ProductConstants = {
  ROUTES: {
    BASE: 'Products',
    ID: ':id',
    USER: 'user',
    BUNDLE: 'bundle',
  },
  SWAGGER: {
    TAG: 'products',
    SUMMARY: {
      CREATE: 'Create a new product',
      FIND_ALL: 'Get all products for current user',
      FIND_ONE: 'Get a product by ID',
      UPDATE: 'Update a product by ID',
      DELETE: 'Delete a product by ID',
    },
  },
  VALIDATION: {
    TITLE_REQUIRED: 'Product title is required',
    ICON_REQUIRED: 'Product icon is required',
    STATUS_ENUM: 'Status must be ACTIVE or INACTIVE',
    BUNDLE_NOT_FOUND: 'Bundle not found',
    BUNDLE_FETCHED: 'Bundle fetched successfully',
  },
};
