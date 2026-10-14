import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { type Response } from 'express';

import { HealthService } from './health.service';
import { Public } from '../../common/decorators/public.decorator';

@Public()
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('healthz')
  healthz() {
    return this.healthService.liveness();
  }

  @Get('readyz')
  async readyz(@Res({ passthrough: true }) res: Response) {
    const body = await this.healthService.readiness();
    res.status(body.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }

  /**
   * GET /server-time
   *
   * Returns the current server UTC time as an ISO 8601 string.
   * Used by the student dashboard to compare simulation start dates
   * against a trusted time source instead of the client's local clock.
   *
   * Response: { utc: string }  e.g. { "utc": "2026-07-23T06:16:00.000Z" }
   */
  @Get('server-time')
  serverTime() {
    return { utc: new Date().toISOString() };
  }
}
