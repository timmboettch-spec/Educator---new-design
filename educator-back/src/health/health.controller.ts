import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import express from 'express';

import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('healthz')
  healthz(): ReturnType<HealthService['liveness']> {
    return this.healthService.liveness();
  }

  @Get('readyz')
  async readyz(
    @Res({ passthrough: true }) res: express.Response,
  ): ReturnType<HealthService['readiness']> {
    const body = await this.healthService.readiness();
    res.status(body.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
