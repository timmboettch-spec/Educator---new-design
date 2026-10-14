# Timeout Abort Integration Examples

## Example 1: Azure Blob Service Integration

### Before: Operation timeout only
```typescript
// src/common/services/azure-blob.service.ts
async downloadBlob(fileName: string): Promise<Buffer> {
  const blobClient = this.containerClient.getBlockBlobClient(fileName);
  
  // Only has operation-specific timeout (20 seconds)
  const abortSignal = AbortSignal.timeout(this.getBlobDownloadTimeoutMs());
  const downloadResponse = await blobClient.download(0, undefined, { abortSignal });
  
  // If request timeout is 60s but blob download times out after 20s,
  // that's fine. But if request should timeout at 30s, the blob download
  // continues for 20s unnecessarily.
}
```

### After: Combined request + operation timeout
```typescript
import { HttpAbortHelper } from '@/common/utils/http-abort.helper';
import { AbortSignalUtil } from '@/common/utils/abort-signal.util';

@Injectable()
export class AzureBlobService {
  constructor(
    private readonly configService: ConfigService,
    private readonly httpAbortHelper: HttpAbortHelper,
    private readonly cls: ClsService,
  ) {}

  async downloadBlob(fileName: string): Promise<Buffer> {
    const blobClient = this.containerClient.getBlockBlobClient(fileName);
    
    // Combine request timeout (60s) with blob-specific timeout (20s)
    // Whichever comes first will abort the operation
    const abortSignal = this.httpAbortHelper.getSignalForFetch(
      this.getBlobDownloadTimeoutMs(),
    );
    
    const downloadResponse = await blobClient.download(0, undefined, { abortSignal });
    
    // If request timeout triggers at 30s, blob download is cancelled immediately
    // If blob timeout is reached first (20s), operation is cancelled then
  }
}
```

## Example 2: User Repository Service

### Before: No timeout handling
```typescript
@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: Repository<User>) {}

  async findUserWithClasses(userId: number): Promise<User> {
    // This query continues even if client disconnects after 30 seconds
    // If the join takes 45+ seconds, we waste database resources
    return this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.classes', 'class')
      .where('user.id = :id', { id: userId })
      .getOne();
  }
}
```

### After: With timeout awareness
```typescript
import { TypeOrmAbortHelper } from '@/common/utils/typeorm-abort.helper';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: Repository<User>,
    private readonly typeOrmAbortHelper: TypeOrmAbortHelper,
    private readonly cls: ClsService,
  ) {}

  async findUserWithClasses(userId: number): Promise<User> {
    // Query is cancelled if:
    // 1. Request timeout occurs (60s default)
    // 2. Query-specific timeout reached (10s)
    // Whichever comes first
    return this.typeOrmAbortHelper.withAbortSignal(
      this.usersRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.classes', 'class')
        .where('user.id = :id', { id: userId })
        .getOne(),
      10000, // 10 second query timeout
      `Find user ${userId} with classes`,
    );
  }

  // For complex transactions
  async updateUserAndClasses(userId: number, updates: Partial<User>): Promise<void> {
    return this.typeOrmAbortHelper.executeQueryWithAbort(
      async () => {
        const queryRunner = await this.typeOrmAbortHelper.createAbortAwareQueryRunner(
          `Update user ${userId}`,
        );

        try {
          await queryRunner.startTransaction();
          
          // Update user
          await queryRunner.manager.update(User, userId, updates);
          
          // Update related classes
          if (updates.schoolId) {
            await queryRunner.manager.update(
              Class,
              { schoolId: updates.schoolId },
              { updatedAt: new Date() },
            );
          }

          await queryRunner.commitTransaction();
        } catch (error) {
          await queryRunner.rollbackTransaction();
          throw error;
        }
      },
      `Update user ${userId} and classes`,
    );
  }
}
```

## Example 3: External API Service

### Before: Fire and forget
```typescript
@Injectable()
export class ReportService {
  async sendReportToExternalApi(reportId: string): Promise<void> {
    const report = await this.getReport(reportId);
    
    // This request continues even after client times out
    // No timeout protection
    const response = await fetch('https://analytics.example.com/reports', {
      method: 'POST',
      body: JSON.stringify(report),
    });

    if (!response.ok) {
      throw new Error('Failed to send report');
    }
  }
}
```

### After: Timeout-aware with fallback
```typescript
import { HttpAbortHelper } from '@/common/utils/http-abort.helper';

@Injectable()
export class ReportService {
  constructor(
    private readonly httpAbortHelper: HttpAbortHelper,
  ) {}

  async sendReportToExternalApi(reportId: string): Promise<void> {
    const report = await this.getReport(reportId);
    
    // Timeout is 30 seconds for this specific API call
    // But will also respect request timeout if it's shorter
    try {
      const response = await this.httpAbortHelper.fetch(
        'https://analytics.example.com/reports',
        {
          method: 'POST',
          body: JSON.stringify(report),
          headers: { 'Content-Type': 'application/json' },
        },
        30000, // 30 second timeout for this API
      );

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        // Either request timeout or API timeout was reached
        this.logger.warn(`Report send cancelled: ${reportId}`);
        // Could queue for retry or handle gracefully
        return;
      }
      throw error;
    }
  }

  // For critical APIs that shouldn't block
  async sendReportAsync(reportId: string): Promise<void> {
    // Check if we're already timing out
    if (this.httpAbortHelper.shouldAbortEarly()) {
      // Skip expensive network call
      return;
    }

    // Continue with send
    await this.sendReportToExternalApi(reportId);
  }
}
```

## Example 4: Cache Service with Redis

### Before: No cancellation
```typescript
@Injectable()
export class CacheService {
  constructor(private readonly redis: Redis) {}

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    // Try cache (no timeout)
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    // Fetch from source (no timeout)
    const data = await fetcher();
    
    // Store in cache (no timeout)
    await this.redis.set(key, JSON.stringify(data), 'EX', 3600);
    
    return data;
  }
}
```

### After: Abort-aware
```typescript
import { ClsService } from 'nestjs-cls';
import { AbortSignalUtil } from '@/common/utils/abort-signal.util';

@Injectable()
export class CacheService {
  constructor(
    private readonly redis: Redis,
    private readonly cls: ClsService,
  ) {}

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const abortSignal = AbortSignalUtil.getAbortSignal(this.cls);
    let isAborted = false;

    // Set up abort listener
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        isAborted = true;
        // Clean up any in-progress operations
      });
    }

    // Check before expensive operations
    if (isAborted) {
      throw new Error('Request aborted');
    }

    try {
      // Try cache
      const cached = await this.redis.get(key);
      if (cached) return JSON.parse(cached);

      // Fetch from source
      const data = await fetcher();

      // Store in cache (skip if we're aborting)
      if (!isAborted) {
        await this.redis.set(key, JSON.stringify(data), 'EX', 3600);
      }

      return data;
    } catch (error) {
      if (isAborted) {
        this.logger.debug(`Cache operation cancelled for key: ${key}`);
      }
      throw error;
    }
  }
}
```

## Example 5: Multi-Step Operation

### Before: All or nothing
```typescript
@Injectable()
export class StudentEnrollmentService {
  async enrollStudent(
    studentId: string,
    classId: string,
  ): Promise<{ success: boolean; studentId: string }> {
    // Step 1: Create enrollment record
    const enrollment = await this.createEnrollment(studentId, classId);

    // Step 2: Send notification email
    await this.mailService.sendEnrollmentNotification(studentId);

    // Step 3: Update analytics
    await this.analyticsService.trackEnrollment(studentId, classId);

    // Step 4: Generate certificate
    await this.certificateService.generateCertificate(studentId);

    return { success: true, studentId };
  }
}
```

### After: Graceful degradation
```typescript
import { HttpAbortHelper } from '@/common/utils/http-abort.helper';
import { AbortSignalUtil } from '@/common/utils/abort-signal.util';

@Injectable()
export class StudentEnrollmentService {
  constructor(
    private readonly httpAbortHelper: HttpAbortHelper,
    private readonly cls: ClsService,
  ) {}

  async enrollStudent(
    studentId: string,
    classId: string,
  ): Promise<{ success: boolean; studentId: string; warnings: string[] }> {
    const warnings: string[] = [];

    try {
      // Step 1: Create enrollment (CRITICAL - must succeed)
      const enrollment = await this.createEnrollment(studentId, classId);

      // Step 2: Send notification (OPTIONAL - can fail)
      try {
        await this.mailService.sendEnrollmentNotification(studentId);
      } catch (error) {
        warnings.push('Email notification failed, but enrollment succeeded');
      }

      // Step 3: Update analytics (OPTIONAL - can be skipped)
      if (!AbortSignalUtil.isAborted(this.cls)) {
        try {
          await this.analyticsService.trackEnrollment(studentId, classId);
        } catch (error) {
          warnings.push('Analytics update failed');
        }
      }

      // Step 4: Generate certificate (OPTIONAL - can be async)
      if (!AbortSignalUtil.isAborted(this.cls)) {
        try {
          await this.certificateService.generateCertificate(studentId);
        } catch (error) {
          warnings.push('Certificate generation will be retried asynchronously');
          // Queue for async retry
          await this.queueCertificateGeneration(studentId);
        }
      }

      return { success: true, studentId, warnings };
    } catch (error) {
      // Critical step failed
      throw new Error(`Enrollment failed for student ${studentId}: ${error}`);
    }
  }
}
```

## Integration Pattern: Service Constructor

All three helpers follow the same pattern:

```typescript
import { TypeOrmAbortHelper } from '@/common/utils/typeorm-abort.helper';
import { HttpAbortHelper } from '@/common/utils/http-abort.helper';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class MyService {
  constructor(
    private readonly typeOrmAbortHelper: TypeOrmAbortHelper,
    private readonly httpAbortHelper: HttpAbortHelper,
    private readonly cls: ClsService,
  ) {}

  async myMethod(): Promise<void> {
    // Use helpers
    const signal = this.httpAbortHelper.getSignalForFetch();
    const result = await this.typeOrmAbortHelper.withAbortSignal(...);
  }
}
```

## Performance Checklist

✅ HTTP requests have abort signal  
✅ Database queries wrapped with timeout  
✅ Complex transactions use abort-aware query runners  
✅ Redis/cache operations check abort state  
✅ Multi-step operations gracefully degrade  
✅ No `await` statements after timeout would trigger  
✅ Resource cleanup in finally blocks  
✅ Proper error handling for AbortError  
