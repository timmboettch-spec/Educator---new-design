import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  Post,
  Delete,
  NotFoundException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { type Action, type Scenario, type Unit } from '../../data/json-data.service';
import { ScenarioAuthGuard } from '../../guards/scenario-auth.guard';

import { AdminService } from './admin.service';
import { CreateScenarioDto } from './dto/create-scenario.dto';
import { UpdateScenarioDto } from './dto/update-scenario.dto';

@ApiTags('Student-backend: Admin')
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  // Scenario Management
  // NOTE: JWT auth intentionally removed for /admin/scenarios* endpoints
  // — the shared HMAC secret with the Educator backend is currently
  // unaligned. Re-add `@UseGuards(ScenarioAuthGuard)` on each of these
  // handlers once `JWT_SECRET` matches on both sides.

  // Student Management (public — no auth guard; key = student licence code)
  @Get('students')
  @ApiOperation({ summary: 'Get all students (permission records)' })
  @ApiResponse({ status: 200, description: 'Return all student permission records' })
  getStudents() {
    return this.adminService.getStudents();
  }

  @Get('scenarios')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all scenarios' })
  @ApiResponse({ status: 200, description: 'Return all scenarios' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getAllScenarios() {
    return this.adminService.getAllScenarios();
  }

  @Get('scenarios/:id')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get scenario by ID' })
  @ApiResponse({ status: 200, description: 'Return scenario' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async getScenarioById(@Param('id') id: string) {
    return this.adminService.getScenarioById(id);
  }

  @Post('scenarios')
  @UseGuards(ScenarioAuthGuard)
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
    return this.adminService.createScenario({ ...dto, id });
  }

  @Put('scenarios/:id')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a scenario' })
  @ApiResponse({ status: 200, description: 'Scenario updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async updateScenario(@Param('id') id: string, @Body() dto: UpdateScenarioDto) {
    return this.adminService.updateScenario(id, dto);
  }

  @Delete('scenarios/:id')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a scenario' })
  @ApiResponse({ status: 200, description: 'Scenario deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Scenario not found' })
  async deleteScenario(@Param('id') id: string) {
    return this.adminService.deleteScenario(id);
  }

  @Post('scenarios/:id/draft')
  @UseGuards(ScenarioAuthGuard)
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
    return this.adminService.createDraftVersion(parentId, dto);
  }

  @Post('scenarios/:id/publish')
  @UseGuards(ScenarioAuthGuard)
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
    return this.adminService.publishDraftVersion(draftId, dto);
  }

  // Unit Management
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @Get('units')
  @ApiOperation({ summary: 'Get all units' })
  @ApiResponse({ status: 200, description: 'Return all units' })
  getAllUnits() {
    return this.adminService.getAllUnits();
  }

  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @Get('units/:id')
  @ApiOperation({ summary: 'Get unit by ID' })
  @ApiResponse({ status: 200, description: 'Return unit' })
  @ApiResponse({ status: 404, description: 'Unit not found' })
  getUnitById(@Param('id') id: string) {
    return this.adminService.getUnitById(id);
  }

  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @Post('units')
  @ApiOperation({ summary: 'Create a new unit' })
  @ApiResponse({ status: 201, description: 'Unit created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  createUnit(@Body() dto: Partial<Unit>) {
    return this.adminService.createUnit(dto);
  }

  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @Put('units/:id')
  @ApiOperation({ summary: 'Update a unit' })
  @ApiResponse({ status: 200, description: 'Unit updated successfully' })
  @ApiResponse({ status: 404, description: 'Unit not found' })
  updateUnit(@Param('id') id: string, @Body() dto: Partial<Unit>) {
    return this.adminService.updateUnit(id, dto);
  }

  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @Delete('units/:id')
  @ApiOperation({ summary: 'Delete a unit' })
  @ApiResponse({ status: 200, description: 'Unit deleted successfully' })
  @ApiResponse({ status: 404, description: 'Unit not found' })
  deleteUnit(@Param('id') id: string) {
    return this.adminService.deleteUnit(id);
  }

  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @Post('units/:id/assign')
  @ApiOperation({ summary: 'Assign a purchased unit to a user key' })
  @ApiResponse({ status: 200, description: 'Unit assigned successfully' })
  @ApiResponse({ status: 404, description: 'Unit not found' })
  assignUnitToUser(@Param('id') id: string, @Body() dto: { key: string; name?: string }) {
    return this.adminService.assignUnitToPermission(dto.key, id, dto.name);
  }

  // -----------------------------
  // Scenario-level Actions API
  // NOTE: JWT auth intentionally removed for these endpoints — same
  // rationale as /admin/scenarios above (shared HMAC secret not aligned
  // with the Educator backend). Re-add `@UseGuards(ScenarioAuthGuard)`
  // per handler once `JWT_SECRET` matches on both sides.
  // -----------------------------

  // Get all actions for a scenario
  @Get('scenarios/:scenarioId/actions')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all actions for a scenario' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getScenarioActions(@Param('scenarioId') scenarioId: string) {
    const scenario = await this.adminService.getScenarioById(scenarioId);
    return scenario.actions ?? [];
  }

  // Create a new action for a scenario
  @Post('scenarios/:scenarioId/actions')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new action for a scenario' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createScenarioAction(@Param('scenarioId') scenarioId: string, @Body() dto: Action) {
    const scenario = await this.adminService.getScenarioById(scenarioId);
    const actions = (scenario.actions ?? []).slice();

    // Ensure order is sequential if not provided
    const nextOrder = dto.order && dto.order > 0 ? dto.order : actions.length + 1;

    const newAction: Action = {
      ...dto,
      order: nextOrder,
    };

    actions.push(newAction);
    await this.adminService.updateScenario(scenarioId, { actions });
    return newAction;
  }

  // Update an action by index for a scenario
  @Put('scenarios/:scenarioId/actions/:index')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an action in a scenario by index' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateScenarioAction(
    @Param('scenarioId') scenarioId: string,
    @Param('index') index: number,
    @Body() dto: Partial<Action>,
  ) {
    const scenario = await this.adminService.getScenarioById(scenarioId);
    const actions = scenario.actions ?? [];

    if (index < 0 || index >= actions.length) {
      throw new NotFoundException(`Action at index ${index} not found`);
    }

    const updated = { ...actions[index], ...dto };
    const newActions = actions.slice();
    newActions[index] = updated;

    await this.adminService.updateScenario(scenarioId, { actions: newActions });
    return updated;
  }

  // Delete an action by index for a scenario
  @Delete('scenarios/:scenarioId/actions/:index')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an action from a scenario by index' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteScenarioAction(
    @Param('scenarioId') scenarioId: string,
    @Param('index') index: number,
  ) {
    const scenario = await this.adminService.getScenarioById(scenarioId);
    const actions = scenario.actions ?? [];

    if (index < 0 || index >= actions.length) {
      throw new NotFoundException(`Action at index ${index} not found`);
    }

    const deletedActionId = actions[index].id;

    const newActions = actions
      .filter((_, i) => i !== index)
      .map((a, idx) => ({ ...a, order: idx + 1 }));

    // Remove references to the deleted action from all orders in this scenario
    type OrderRecord = {
      linkedActionIds?: string[];
      linkedActions?: { id: string }[];
      [key: string]: unknown;
    };
    const updatedOrders = (scenario.orders ?? []).map((order) => {
      const o = order as OrderRecord;
      return {
        ...o,
        linkedActionIds: (o.linkedActionIds ?? []).filter((id) => id !== deletedActionId),
        linkedActions: (o.linkedActions ?? []).filter((a) => a.id !== deletedActionId),
      };
    });

    await this.adminService.updateScenario(scenarioId, {
      actions: newActions,
      orders: updatedOrders,
    });
    return { message: 'Action deleted successfully' };
  }

  //get report by id
  @Get('reports/:id')
  @ApiOperation({ summary: 'Get a single report by ID' })
  @ApiResponse({ status: 200, description: 'Return the report' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async getReportById(@Param('id') id: string) {
    return this.adminService.getReportById(id);
  }

  // -----------------------------
  // Action Category Management
  // NOTE: JWT auth intentionally removed — same rationale as above.
  // -----------------------------

  @Get('scenarios/:scenarioId/categories')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all categories for a scenario' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getScenarioCategories(@Param('scenarioId') scenarioId: string) {
    return this.adminService.getScenarioCategories(scenarioId);
  }

  @Post('scenarios/:scenarioId/categories')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new category for a scenario' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createCategory(
    @Param('scenarioId') scenarioId: string,
    @Body() dto: { name: string; description?: string; color?: string },
  ) {
    return this.adminService.createCategory(scenarioId, dto);
  }

  @Put('scenarios/:scenarioId/categories/:categoryId')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a category for a scenario' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateCategory(
    @Param('scenarioId') scenarioId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: { name?: string; description?: string; color?: string },
  ) {
    return this.adminService.updateCategory(scenarioId, categoryId, dto);
  }

  @Delete('scenarios/:scenarioId/categories/:categoryId')
  @UseGuards(ScenarioAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a category (reassigns actions to Uncategorized)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteCategory(
    @Param('scenarioId') scenarioId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.adminService.deleteCategory(scenarioId, categoryId);
  }
}
