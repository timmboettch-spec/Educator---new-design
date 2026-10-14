import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

/**
 * Thin wrapper around the app's TypeORM `DataSource`.
 *
 * `TypeOrmModule.forRootAsync` (see `DatabaseModule`) already owns the connection
 * lifecycle (connect on bootstrap, close on shutdown), so this service does
 * not duplicate that — it exists so consumers of the database layer depend
 * on `DatabaseService`/repository tokens rather than reaching for
 * `@InjectDataSource()` directly, matching the adapter boundary described in
 * `database.module.ts`.
 */
@Injectable()
export class DatabaseService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  get connection(): DataSource {
    return this.dataSource;
  }

  async pingCheck(): Promise<{ up: boolean; message?: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { up: true };
    } catch (error) {
      return { up: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async runInTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }
}
