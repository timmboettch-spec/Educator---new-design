import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Post,
  Delete,
  // NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { /* type Action, */ type Scenario } from 'src/common/interfaces/student-scenario.interface';

import { AdminService } from './admin.service';
import { CreateScenarioDto } from './dto/create-scenario.dto';
import { UpdateScenarioDto } from './dto/update-scenario.dto';
import { SimulationV2 /* , SimulationAction */ } from 'src/database/entities';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';
import { RoleSlug } from 'src/common/constants';

@ApiTags('Student-backend: Admin')
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  // Scenario Management

  @Get('scenarios')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all scenarios' })
  @ApiResponse({ status: 200, description: 'Return all scenarios' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getAllScenarios() {
    return this.adminService.getAllScenarios();
  }

  @Get('scenarios/:id')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN, RoleSlug.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get scenario by ID' })
  @ApiResponse({ status: 200, description: 'Return scenario' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async getScenarioById(@Param('id') id: string) {
    return this.adminService.getScenarioByIdForController(id);
  }

  @Post('scenarios')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new scenario' })
  @ApiResponse({ status: 201, description: 'Scenario created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createScenario(@Body() dto: CreateScenarioDto) {
    const id = (dto.id ?? dto.scenarioId)?.trim();
    if (!id) {
      throw new BadRequestException('Scenario ID is required');
    }
    return this.adminService.createScenario({ ...dto, id } as unknown as Partial<SimulationV2>);
  }

  @Put('scenarios/:id')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a scenario' })
  @ApiResponse({ status: 200, description: 'Scenario updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async updateScenario(@Param('id') id: string, @Body() dto: UpdateScenarioDto) {
    return this.adminService.updateScenario(id, dto as unknown as Partial<SimulationV2>);
  }

  @Delete('scenarios/:id')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a scenario' })
  @ApiResponse({ status: 200, description: 'Scenario deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async deleteScenario(@Param('id') id: string) {
    return this.adminService.deleteScenario(id);
  }

  @Post('scenarios/:id/draft')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Fork a published scenario into a new draft version',
    description:
      'Creates a new draft record linked to the parent via parent_scenario_id. ' +
      'The parent published scenario is NOT modified and remains live for students. ' +
      'Calling this endpoint again when a draft already exists updates the existing draft in place (single active draft per scenario).',
  })
  @ApiResponse({ status: 201, description: 'Draft version created or updated successfully' })
  @ApiResponse({ status: 400, description: 'Parent scenario is not in published status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Parent scenario not found' })
  async createDraftVersion(@Param('id') parentId: string, @Body() dto: Partial<Scenario>) {
    return this.adminService.createDraftVersion(parentId, dto as unknown as Partial<SimulationV2>);
  }

  @Post('scenarios/:id/publish')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Promote a draft version to published',
    description:
      'Sets the draft status to published and archives the parent published scenario. ' +
      'Student-facing endpoints always filter status=published so students immediately see the new version.',
  })
  @ApiResponse({ status: 201, description: 'Draft promoted to published; parent archived' })
  @ApiResponse({ status: 400, description: 'Scenario is not a draft or has no parent' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Draft scenario not found' })
  async publishDraftVersion(@Param('id') draftId: string, @Body() dto: Partial<Scenario>) {
    return this.adminService.publishDraftVersion(draftId, dto as unknown as Partial<SimulationV2>);
  }

  // Unit Management
  @ApiBearerAuth()
  @Get('units')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN)
  @ApiOperation({ summary: 'Get all units' })
  @ApiResponse({ status: 200, description: 'Return all units' })
  getAllUnits() {
    return this.adminService.getAllUnits();
  }

  @ApiBearerAuth()
  @Get('units/:id')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN, RoleSlug.STUDENT)
  @ApiOperation({ summary: 'Get unit by ID' })
  @ApiResponse({ status: 200, description: 'Return unit' })
  @ApiResponse({ status: 404, description: 'Unit not found' })
  getUnitById(@Param('id') id: string) {
    return this.adminService.getUnitById(id);
  }

  @Get('reports/:id')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN, RoleSlug.EDUCATOR, RoleSlug.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single report by ID' })
  @ApiResponse({ status: 200, description: 'Return the report' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async getReportById(@Param('id') id: string) {
    return this.adminService.getReportById(id);
  }

  // -----------------------------
  // Action Category Management
  // -----------------------------

  @Get('scenarios/:scenarioId/categories')
  @RequiredRoles(RoleSlug.SCENARIO_ADMIN, RoleSlug.EDUCATOR, RoleSlug.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all categories for a scenario' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getScenarioCategories(@Param('scenarioId') scenarioId: string) {
    return this.adminService.getScenarioCategories(scenarioId);
  }
}
