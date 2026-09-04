import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { ScenarioAuthGuard } from '../../guards/scenario-auth.guard';

import { UnitsService } from './units.service';

@ApiTags('Student-backend: Units')
@ApiBearerAuth()
@UseGuards(ScenarioAuthGuard)
@Controller('units')
export class UnitsController {
  constructor(private unitsService: UnitsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all units' })
  @ApiResponse({ status: 200, description: 'Return all units' })
  findAll() {
    return this.unitsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get unit by ID' })
  @ApiResponse({ status: 200, description: 'Return unit' })
  @ApiResponse({ status: 404, description: 'Unit not found' })
  findOne(@Param('id') id: string) {
    return this.unitsService.findOne(id);
  }
}
