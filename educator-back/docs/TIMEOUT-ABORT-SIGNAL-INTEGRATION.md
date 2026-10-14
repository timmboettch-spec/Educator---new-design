# Request Timeout with AbortSignal Integration Guide

## Overview

**Problem (Before):** RxJS `timeout()` operator only cancels the Observable subscription. Underlying database queries, Redis calls, and HTTP requests continue running in the background, wasting resources and potentially causing connection pool exhaustion.

**Solution (After):** Integration of AbortSignal (native Node.js) with request-scoped context (nestjs-cls) to propagate cancellation to all underlying operations.

## Architecture

```
Request arrives
     ↓
RequestTimeoutInterceptor
  - Creates AbortController
  - Stores in cls context
  - Sets setTimeout to abort on timeout
     ↓
Service receives request
  - Retrieves AbortSignal from cls
  - Passes signal to DB/HTTP/Redis operations
     ↓
Operations support AbortSignal
  - fetch() natively supports AbortSignal
  - TypeORM queries can be wrapped with timeout race
  - Redis operations can listen to abort signal
     ↓
Timeout occurs
  - AbortController triggers abort()
  - All AbortSignal listeners are notified
  - DB connections released
  - HTTP requests cancelled
  - Redis operations cancelled
```

## Usage Patterns

### Pattern 1: HTTP Requests (fetch/axios)

**Using fetch:**
```typescript
import { HttpAbortHelper } from '@/common/utils/http-abort.helper';

@Injectable()
export class ExternalApiService {
  constructor(
    private readonly httpAbortHelper: HttpAbortHelper,
  ) {}

  async fetchExternalData(userId: string): Promise<any> {
    // Option A: Use helper's fetch wrapper (recommended)
    const response = await this.httpAbortHelper.fetch(
      `https://api.example.com/users/${userId}`,
      { method: 'GET' },
      5000, // 5 second operation timeout (in addition to request timeout)
    );
    return response.json();

    // Option B: Manual - get signal and pass to fetch
    // const signal = this.httpAbortHelper.getSignalForFetch(5000);
    // const response = await fetch(url, { signal });
    // return response.json();
  }
}
```

**Using axios:**
```typescript
import { HttpAbortHelper } from '@/common/utils/http-abort.helper';
import axios from 'axios';

@Injectable()
export class ExternalApiService {
  constructor(private readonly httpAbortHelper: HttpAbortHelper) {}

  async fetchWithAxios(): Promise<any> {
    const config = this.httpAbortHelper.createAxiosConfig(5000);
    const response = await axios.get('https://api.example.com/data', config);
    return response.data;
  }
}
```

### Pattern 2: TypeORM Database Queries

**Using the helper:**
```typescript
import { TypeOrmAbortHelper } from '@/common/utils/typeorm-abort.helper';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: Repository<User>,
    private readonly typeOrmAbortHelper: TypeOrmAbortHelper,
  ) {}

  async findUserWithTimeout(userId: number): Promise<User | null> {
    // Wrap your query with abort signal support
    return this.typeOrmAbortHelper.withAbortSignal(
      this.usersRepository.findOne({ where: { id: userId } }),
      5000, // Optional: operation-specific timeout in addition to request timeout
      'Find user by ID', // For logging
    );
  }

  async complexQuery(): Promise<User[]> {
    return this.typeOrmAbortHelper.executeQueryWithAbort(
      async () => {
        return this.usersRepository
          .createQueryBuilder('user')
          .leftJoinAndSelect('user.classes', 'class')
          .leftJoinAndSelect('user.school', 'school')
          .where('user.isActive = :active', { active: true })
          .getMany();
      },
      'Complex user query',
    );
  }
}
```

### Pattern 3: Accessing AbortSignal Directly

**For custom implementations:**
```typescript
import { ClsService } from 'nestjs-cls';
import { AbortSignalUtil } from '@/common/utils/abort-signal.util';

@Injectable()
export class CustomService {
  constructor(private readonly cls: ClsService) {}

  async doCustomWork(): Promise<void> {
    // Get the abort signal
    const abortSignal = AbortSignalUtil.getAbortSignal(this.cls);

    // Check if already aborted
    if (AbortSignalUtil.isAborted(this.cls)) {
      throw new Error('Request timeout already triggered');
    }

    // Listen to abort event
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        const reason = AbortSignalUtil.getAbortReason(abortSignal);
        console.log(`Operation cancelled: ${reason}`);
        // Clean up resources
      });
    }

    // Combine with operation-specific timeout
    const operationSignal = AbortSignal.timeout(3000);
    const combined = AbortSignalUtil.combineAbortSignals(
      abortSignal,
      operationSignal,
    );

    // Pass to operation
    await this.doWorkWithSignal(combined);
  }

  private async doWorkWithSignal(signal?: AbortSignal): Promise<void> {
    // Use signal with any operation that supports AbortSignal
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 1000);

    const combined = AbortSignalUtil.combineAbortSignals(signal, controller.signal);
    await fetch('/api/data', { signal: combined });
  }
}
```

### Pattern 4: Redis Operations

**With proper abort handling:**
```typescript
import { ClsService } from 'nestjs-cls';
import { AbortSignalUtil } from '@/common/utils/abort-signal.util';

@Injectable()
export class CacheService {
  constructor(
    private readonly redisClient: Redis,
    private readonly cls: ClsService,
  ) {}

  async getCachedData(key: string): Promise<any> {
    const abortSignal = AbortSignalUtil.getAbortSignal(this.cls);

    // Set up abort listener
    let isAborted = false;
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        isAborted = true;
      });
    }

    try {
      // Redis in Node.js doesn't natively support AbortSignal,
      // but you can check before/after operations
      if (isAborted) {
        throw new Error('Operation aborted before Redis call');
      }

      const result = await this.redisClient.get(key);

      if (isAborted) {
        throw new Error('Operation aborted during Redis call');
      }

      return result;
    } catch (error) {
      if (isAborted) {
        console.log('Redis operation cancelled by timeout');
      }
      throw error;
    }
  }
}
```

## Registering Helpers in Module

Add the new helpers to your module:

```typescript
import { Module } from '@nestjs/common';
import { AbortSignalUtil } from '@/common/utils/abort-signal.util';
import { TypeOrmAbortHelper } from '@/common/utils/typeorm-abort.helper';
import { HttpAbortHelper } from '@/common/utils/http-abort.helper';

@Module({
  providers: [
    TypeOrmAbortHelper,
    HttpAbortHelper,
    // AbortSignalUtil is a static utility, no need to register
  ],
  exports: [TypeOrmAbortHelper, HttpAbortHelper],
})
export class CommonUtilsModule {}
```

Then use in services:

```typescript
@Module({
  imports: [CommonUtilsModule, DatabaseModule],
  providers: [MyService],
})
export class MyModule {}

@Injectable()
export class MyService {
  constructor(
    private readonly httpAbortHelper: HttpAbortHelper,
    private readonly typeOrmAbortHelper: TypeOrmAbortHelper,
  ) {}
}
```

## Configuration

The timeout duration is configured via environment variables:

```env
# Default: 60000 (60 seconds)
API_TIMEOUT_MS=60000

# Other timeout settings
DB_POOL_IDLE_TIMEOUT_MS=30000
DB_POOL_ACQUIRE_TIMEOUT_MS=5000
BLOB_DOWNLOAD_TIMEOUT_MS=20000
```

To override for specific operations, pass `operationTimeoutMs` to the helpers:

```typescript
// This operation has a 5 second limit (in addition to API_TIMEOUT_MS)
await this.httpAbortHelper.fetch(url, options, 5000);
```

## Migration Guide: Updating Existing Code

### Before: No abort support
```typescript
async getUser(id: number): Promise<User> {
  // HTTP request runs even after client disconnects
  const response = await fetch(`/api/users/${id}`);
  
  // DB query runs even if timeout occurred
  return this.usersRepository.findOne({ where: { id } });
}
```

### After: With abort support
```typescript
async getUser(id: number): Promise<User> {
  // HTTP request is cancelled if timeout occurs
  const response = await this.httpAbortHelper.fetch(`/api/users/${id}`);
  
  // DB query is cancelled if timeout occurs
  return this.typeOrmAbortHelper.withAbortSignal(
    this.usersRepository.findOne({ where: { id } }),
  );
}
```

## Testing Timeout Behavior

```typescript
describe('Timeout Cancellation', () => {
  it('should cancel HTTP request on timeout', async () => {
    const signal = AbortSignalUtil.getAbortSignal(cls);
    
    // Manually trigger abort
    (signal as any)?.abort?.(new Error('Test timeout'));
    
    // Verify that fetch fails with AbortError
    await expect(
      fetch(url, { signal }),
    ).rejects.toThrow('AbortError');
  });
});
```

## Metrics & Monitoring

The system tracks timeouts via Prometheus:

```typescript
import { timeoutCounter } from '@/common/metrics/app.metrics';

// Automatically incremented when timeout occurs
// Metric: http_request_timeouts_total{method="GET",path="/api/users"}
```

Query timeouts in Prometheus:
```promql
rate(http_request_timeouts_total[5m])
```

## Performance Impact

- **Minimal overhead**: AbortController creation and cls storage is ~1-2ms per request
- **Resource savings**: Cancels expensive operations, reducing CPU and connection pool usage
- **Connection pool**: Prevents connection exhaustion from abandoned long-running queries

## Common Issues & Troubleshooting

### Issue: "Cannot read property 'set' of undefined (cls context)"
**Cause:** Outside of HTTP request context (e.g., scheduled job)
**Solution:** Helpers gracefully handle missing cls context; operations run without timeout
```typescript
const signal = AbortSignalUtil.getAbortSignal(cls); // Returns undefined
// Operation runs normally
```

### Issue: "AbortError: The operation was aborted"
**Cause:** Request timeout triggered before operation completed
**Solution:** This is expected behavior. Ensure your error handler catches AbortError:
```typescript
try {
  await this.httpAbortHelper.fetch(url);
} catch (error) {
  if (error?.name === 'AbortError') {
    // Expected timeout
    return {};
  }
  throw error;
}
```

### Issue: Redis operations not getting cancelled
**Cause:** Redis Node.js client doesn't support AbortSignal
**Solution:** Add pre-flight abort check and graceful shutdown:
```typescript
const signal = AbortSignalUtil.getAbortSignal(this.cls);
if (signal?.aborted) {
  throw new Error('Aborted');
}
```

## References

- [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [Node.js: AbortSignal](https://nodejs.org/api/abort_controller.html)
- [nestjs-cls Documentation](https://docs.nestjs.com/techniques/request-scoped)
