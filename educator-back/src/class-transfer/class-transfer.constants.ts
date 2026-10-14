export const ClassTransferConstants = {
  ROUTES: {
    BASE: 'class-transfers',
    AUDIT: 'audit',
    EDUCATOR_CLASSES: 'educator/:educatorId/classes',
  },

  SWAGGER: {
    TAG: 'Class Transfers',
  },

  ERRORS: {
    CLASS_NOT_FOUND: 'Class not found',
    CLASS_HAS_NO_OWNER: 'Class has no current owner and cannot be transferred',
    CLASS_DELETED: 'Cannot transfer a deleted class',
    CLASS_INACTIVE: 'Cannot transfer an inactive class',
    SOURCE_EDUCATOR_NOT_FOUND: 'Source educator not found',
    TARGET_EDUCATOR_NOT_FOUND: 'Target educator not found',
    TARGET_EDUCATOR_INACTIVE: 'Target educator is inactive and cannot receive a class transfer',
    TARGET_EDUCATOR_DELETED: 'Target educator account has been deleted',
    SAME_EDUCATOR: 'Source and target educator cannot be the same',
    FORBIDDEN: 'Only administrators can perform class transfers',
  },

  MESSAGES: {
    TRANSFER_SUCCESS: 'Class transferred successfully',
    AUDIT_FETCHED: 'Transfer audit history fetched successfully',
  },
};
