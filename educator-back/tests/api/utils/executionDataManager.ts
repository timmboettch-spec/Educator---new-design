import fs from 'fs';
import path from 'path';

/**
 * ============================================================================
 * EXECUTION DATA MANAGER
 * ============================================================================
 * 
 * Manages centralized storage and retrieval of entity IDs across test modules.
 * Captures all created resource IDs during test execution for cleanup phase.
 * 
 * Usage:
 *   1. Initialize: ExecutionDataManager.initialize()
 *   2. Save IDs: ExecutionDataManager.saveEntityId('school', schoolId)
 *   3. Retrieve: ExecutionDataManager.getEntityIds('school')
 *   4. Finalize: ExecutionDataManager.finalize()
 * 
 * Data stored in: tests/api/test-data/execution-data.json
 * ============================================================================
 */

interface EntityData {
  created: string[];
  deleted: string[];
  deletedCount: number;
  failedCount: number;
}

interface CleanupResult {
  entity: string;
  id: string;
  status: 'deleted' | 'failed' | 'pending';
  httpStatus?: number;
  message?: string;
}

interface CleanupData {
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  startTime?: string;
  endTime?: string;
  results: CleanupResult[];
}

interface ExecutionData {
  executionId: string;
  startTime: string;
  endTime?: string;
  status: 'in-progress' | 'completed' | 'interrupted';
  auth: {
    userId?: string;
    accessToken?: string;
    testUserEmail?: string;
  };
  entities: {
    school: EntityData;
    educator: EntityData;
    class: EntityData;
    student: EntityData;
    simulation?: EntityData;
  };
  cleanup: CleanupData;
}

/**
 * Execution Data Manager Class
 * Handles centralized ID storage for all test modules
 */
export class ExecutionDataManager {
  private static readonly DATA_DIR = path.resolve(
    __dirname,
    '../test-data'
  );

  private static readonly DATA_FILE = path.join(
    ExecutionDataManager.DATA_DIR,
    'execution-data.json'
  );

  /**
   * Initialize execution data
   * Called at the start of test run
   */
  static initialize(): void {
    // Ensure directory exists
    if (!fs.existsSync(ExecutionDataManager.DATA_DIR)) {
      fs.mkdirSync(ExecutionDataManager.DATA_DIR, {
        recursive: true,
      });
    }

    const executionData: ExecutionData = {
      executionId: new Date().toISOString(),
      startTime: new Date().toISOString(),
      status: 'in-progress',
      auth: {},
      entities: {
        school: {
          created: [],
          deleted: [],
          deletedCount: 0,
          failedCount: 0,
        },
        educator: {
          created: [],
          deleted: [],
          deletedCount: 0,
          failedCount: 0,
        },
        class: {
          created: [],
          deleted: [],
          deletedCount: 0,
          failedCount: 0,
        },
        student: {
          created: [],
          deleted: [],
          deletedCount: 0,
          failedCount: 0,
        },
        simulation: {
          created: [],
          deleted: [],
          deletedCount: 0,
          failedCount: 0,
        },
      },
      cleanup: {
        status: 'pending',
        results: [],
      },
    };

    fs.writeFileSync(
      ExecutionDataManager.DATA_FILE,
      JSON.stringify(executionData, null, 2)
    );
  }

  static saveEntityId(entity: string, id: string): void {
    try {
      const data = ExecutionDataManager.getExecutionData();

      if (!data.entities[entity as keyof typeof data.entities]) {
        (data.entities[entity as keyof typeof data.entities] as EntityData) = {
          created: [],
          deleted: [],
          deletedCount: 0,
          failedCount: 0,
        };
      }

      if (id && !(data.entities[entity as keyof typeof data.entities] as EntityData).created.includes(id)) {
        (data.entities[entity as keyof typeof data.entities] as EntityData).created.push(id);
      }

      fs.writeFileSync(
        ExecutionDataManager.DATA_FILE,
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      console.error(
        `Failed to save entity ID for ${entity}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  static getEntityIds(entity: string): string[] {
    try {
      const data = ExecutionDataManager.getExecutionData();
      const entityData = data.entities[entity as keyof typeof data.entities];
      return entityData?.created || [];
    } catch (error) {
      console.error(
        `Failed to get entity IDs for ${entity}:`,
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Set authentication data
   * @param userId - User ID from login response
   * @param accessToken - Access token for API calls
   */
  static setAuthData(userId: string, accessToken: string): void {
    try {
      const data = ExecutionDataManager.getExecutionData();
      data.auth = { userId, accessToken };
      fs.writeFileSync(
        ExecutionDataManager.DATA_FILE,
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      console.error(
        'Failed to set auth data:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get authentication data
   * @returns Auth data (userId and accessToken)
   */
  static getAuthData(): { userId?: string; accessToken?: string } {
    try {
      const data = ExecutionDataManager.getExecutionData();
      return data.auth || {};
    } catch {
      return {};
    }
  }

  /**
   * Update cleanup status
   * @param entity - Entity type
   * @param id - Entity ID
   * @param status - Deletion status
   * @param httpStatus - HTTP status code
   * @param message - Response message
   */
  static updateCleanupStatus(
    entity: string,
    id: string,
    status: 'deleted' | 'failed' | 'pending',
    httpStatus?: number,
    message?: string
  ): void {
    try {
      const data = ExecutionDataManager.getExecutionData();

      const result: CleanupResult = {
        entity,
        id,
        status,
        httpStatus,
        message,
      };

      data.cleanup.results.push(result);

      const entityData = data.entities[entity as keyof typeof data.entities];
      if (entityData) {
        if (status === 'deleted') {
          entityData.deletedCount++;
          if (!entityData.deleted.includes(id)) {
            entityData.deleted.push(id);
          }
        } else if (status === 'failed') {
          entityData.failedCount++;
        }
      }

      fs.writeFileSync(
        ExecutionDataManager.DATA_FILE,
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      console.error(
        `Failed to update cleanup status for ${entity}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get complete execution data
   * @returns Full execution data object
   */
  static getExecutionData(): ExecutionData {
    try {
      if (!fs.existsSync(ExecutionDataManager.DATA_FILE)) {
        throw new Error('Execution data file not found');
      }

      const content = fs.readFileSync(
        ExecutionDataManager.DATA_FILE,
        'utf-8'
      );
      return JSON.parse(content) as ExecutionData;
    } catch (error) {
      console.error(
        'Failed to read execution data:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Finalize execution data
   * Called at end of test run
   */
  static finalize(): void {
    try {
      const data = ExecutionDataManager.getExecutionData();
      data.endTime = new Date().toISOString();
      data.status = 'completed';

      if (data.cleanup.results.length > 0) {
        data.cleanup.status = 'completed';
        data.cleanup.endTime = new Date().toISOString();
      }

      fs.writeFileSync(
        ExecutionDataManager.DATA_FILE,
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      console.error(
        'Failed to finalize execution data:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  static markInterrupted(): void {
    try {
      const data = ExecutionDataManager.getExecutionData();
      data.status = 'interrupted';
      data.endTime = new Date().toISOString();

      fs.writeFileSync(
        ExecutionDataManager.DATA_FILE,
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      console.error(
        'Failed to mark execution as interrupted:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  static reset(): void {
    try {
      if (fs.existsSync(ExecutionDataManager.DATA_FILE)) {
        fs.unlinkSync(ExecutionDataManager.DATA_FILE);
      }
    } catch (error) {
      console.error(
        'Failed to reset execution data:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  static getCleanupSummary(): {
    total: number;
    deleted: number;
    failed: number;
  } {
    try {
      const data = ExecutionDataManager.getExecutionData();
      const results = data.cleanup.results;

      return {
        total: results.length,
        deleted: results.filter((r) => r.status === 'deleted').length,
        failed: results.filter((r) => r.status === 'failed').length,
      };
    } catch {
      return { total: 0, deleted: 0, failed: 0 };
    }
  }

  /**
   * Set test user email
   * @param email - Dynamically generated test user email
   */
  static setTestUserEmail(email: string): void {
    try {
      const data = ExecutionDataManager.getExecutionData();
      data.auth.testUserEmail = email;
      fs.writeFileSync(
        ExecutionDataManager.DATA_FILE,
        JSON.stringify(data, null, 2)
      );
    } catch (error) {
      console.error(
        'Failed to set test user email:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get test user email
   * @returns Test user email or undefined if not set
   */
  static getTestUserEmail(): string | undefined {
    try {
      const data = ExecutionDataManager.getExecutionData();
      return data.auth?.testUserEmail;
    } catch {
      return undefined;
    }
  }
}

export default ExecutionDataManager;
