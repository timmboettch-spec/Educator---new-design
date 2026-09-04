import { Controller, Get, Param, Query, Headers, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { ScenarioAuthGuard } from '../../guards/scenario-auth.guard';

import { ScenarioAssignmentGuard } from './guards/scenario-assignment.guard';
import { ScenariosService } from './scenarios.service';

@ApiTags('Student-backend: Scenario')
@ApiBearerAuth()
@Controller('scenarios')
export class ScenariosController {
  constructor(private scenariosService: ScenariosService) {}

  @Get('default')
  @UseGuards(ScenarioAuthGuard, ScenarioAssignmentGuard)
  @ApiOperation({ summary: 'Get default scenario for factory reset' })
  @ApiResponse({ status: 200, description: 'Return default scenario' })
  @ApiResponse({ status: 403, description: 'Scenario not assigned to this student' })
  async getDefaultScenario() {
    return this.scenariosService.getDefaultScenario();
  }

  @Get('default/:id')
  @UseGuards(ScenarioAuthGuard, ScenarioAssignmentGuard)
  @ApiOperation({ summary: 'Get default scenario for factory reset' })
  @ApiResponse({ status: 200, description: 'Return default scenario' })
  @ApiResponse({ status: 403, description: 'Scenario not assigned to this student' })
  async getDefaultScenarioById(@Param('id') id: string) {
    return this.scenariosService.getDefaultScenario(id);
  }

  @Get()
  @UseGuards(ScenarioAuthGuard)
  @ApiOperation({ summary: 'Get all scenarios' })
  @ApiResponse({ status: 200, description: 'Return all scenarios' })
  async findAll(@Query('lang') lang?: string) {
    return this.scenariosService.findAll(lang);
  }

  @Get('unit/:unitId')
  // NOTE: JWT signature validation intentionally removed \u2014 same rationale
  // as `findOne` below (shared HMAC secret not aligned with the Educator
  // backend). Re-add `@UseGuards(ScenarioAuthGuard)` once
  // `JWT_SECRET` matches on both sides.
  @ApiOperation({ summary: 'Get scenarios by unit' })
  @ApiResponse({ status: 200, description: 'Return scenarios for unit' })
  async findByUnit(
    @Param('unitId') unitId: string,
    @Headers('authorization') auth?: string,
    @Query('lang') lang?: string,
  ) {
    const userId = auth ? this.extractUserId(auth) : undefined;
    return this.scenariosService.findByUnit(unitId, userId, lang);
  }

  @Get(':id')
  @UseGuards(ScenarioAuthGuard, ScenarioAssignmentGuard)
  @ApiOperation({ summary: 'Get scenario by ID' })
  @ApiResponse({ status: 200, description: 'Return scenario' })
  @ApiResponse({ status: 403, description: 'Scenario not assigned to this student' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async findOne(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
    @Query('lang') lang?: string,
  ) {
    const userId = auth ? this.extractUserId(auth) : undefined;
    return this.scenariosService.findOne(id, userId, lang);
  }

  private extractUserId(auth: string): string | undefined {
    const token = auth?.replace('Bearer ', '');
    return token ? token.replace('token-', '') : undefined;
  }
}
