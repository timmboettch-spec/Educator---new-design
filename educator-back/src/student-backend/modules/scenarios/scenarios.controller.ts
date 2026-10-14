import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { ICurrentUser } from 'src/common/interfaces';

import { ScenariosService } from './scenarios.service';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

@ApiTags('Student-backend: Scenario')
@ApiBearerAuth()
@Controller('scenarios')
export class ScenariosController {
  constructor(private scenariosService: ScenariosService) { }

  // Disabled — not currently used by any client.
  // @Get('default')
  // @ApiOperation({ summary: 'Get default scenario for factory reset' })
  // @ApiResponse({ status: 200, description: 'Return default scenario' })
  // @ApiResponse({ status: 403, description: 'Scenario not assigned to this student' })
  // async getDefaultScenario() {
  //   return this.scenariosService.getDefaultScenario();
  // }

  // Disabled — not currently used by any client.
  // @Get('default/:id')
  // @ApiOperation({ summary: 'Get default scenario for factory reset' })
  // @ApiResponse({ status: 200, description: 'Return default scenario' })
  // @ApiResponse({ status: 403, description: 'Scenario not assigned to this student' })
  // async getDefaultScenarioById(@Param('id') id: string) {
  //   return this.scenariosService.getDefaultScenario(id);
  // }

  @Get()
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Get all scenarios' })
  @ApiResponse({ status: 200, description: 'Return all scenarios' })
  async findAll() {
    return this.scenariosService.findAll();
  }

  // Disabled \u2014 not currently used by any client.
  @Get('unit/:unitId')
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Get scenarios by unit' })
  @ApiResponse({ status: 200, description: 'Return scenarios for unit' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Scenario not assigned to this student' })
  async findByUnit(@Param('unitId') unitId: string, @CurrentUser() currentUser: ICurrentUser) {
    return this.scenariosService.findByUnit(unitId, currentUser.userId);
  }

  @Get(':id')
  @RequiredRoles(RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Get scenario by ID' })
  @ApiResponse({ status: 200, description: 'Return scenario' })
  @ApiResponse({ status: 403, description: 'Scenario not assigned to this student' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: ICurrentUser) {
    return this.scenariosService.findOne(currentUser, id);
  }
}
