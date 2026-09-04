import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClassSimulationService } from './class-simulation.service';
import { AssignClassSimulationDto, UpdateClassSimulationDto } from './dto/class-simulation.dto';
import { ApiResponse } from 'src/common/types';
import { AppStatus, ErrorTypes, Messages } from 'src/common/utils/messages';
import { throwAppError } from 'src/common/utils/app-error';
import { ClassSimulation } from './entity/class-simulation.entity';
import { ClassSimulationConstants } from './class-simulation.constant';
import * as types from 'src/common/types';
import { ClassConstants } from 'src/class/classes.constants';
import { EducatorsService } from 'src/educators/educators.service';

@ApiTags(ClassSimulationConstants.SWAGGER.TAG)
@Controller(ClassSimulationConstants.ROUTES.BASE)
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT-auth')
export class ClassSimulationController {
  constructor(
    private readonly service: ClassSimulationService,
    private readonly educatorService: EducatorsService,
  ) {}

  @Post()
  @ApiOperation({ summary: ClassSimulationConstants.SWAGGER.ASSIGN })
  async assign(
    @Body() dto: AssignClassSimulationDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse<ClassSimulation>> {
    const roles = req.user.roles || [];
    const isEducator = roles.includes(ClassConstants.ROLE.EDUCATOR);

    if (!isEducator) {
      throw new ForbiddenException(Messages.ONLY_EDUCATOR_CREATE);
    }
    const educatorTokens = await this.educatorService.availableTokens(req.user.userId);
    if (educatorTokens === null) {
      throw new ForbiddenException(Messages.NO_TOKENS);
    }

    const educatorResponse = await this.educatorService.findById(req.user.userId);

    if (!educatorResponse.data) {
      throw new NotFoundException(Messages.EDUCATOR_NOT_FOUND);
    }

    const result = await this.service.assign(dto, educatorResponse.data);

    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(ClassSimulationConstants.ROUTES.BY_CLASS)
  @ApiOperation({ summary: ClassSimulationConstants.SWAGGER.BY_CLASS })
  async findByClass(@Param('class_id') class_id: string): Promise<ApiResponse> {
    if (!class_id)
      throwAppError(ClassSimulationConstants.VALIDATION.CLASS_ID_REQUIRED, ErrorTypes.BAD_REQUEST);
    const result = await this.service.findByClass(class_id);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(ClassSimulationConstants.ROUTES.BY_SIMULATION)
  @ApiOperation({ summary: ClassSimulationConstants.SWAGGER.BY_SIMULATION })
  async findBySimulation(@Param('simulation_id') simulation_id: string): Promise<ApiResponse> {
    if (!simulation_id)
      throwAppError(
        ClassSimulationConstants.VALIDATION.SIMULATION_ID_REQUIRED,
        ErrorTypes.BAD_REQUEST,
      );
    const result = await this.service.findBySimulation(simulation_id);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(ClassSimulationConstants.ROUTES.ID)
  @ApiOperation({ summary: ClassSimulationConstants.SWAGGER.UPDATE })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClassSimulationDto,
  ): Promise<ApiResponse<ClassSimulation>> {
    const result = await this.service.update(id, dto);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Delete(ClassSimulationConstants.ROUTES.ID)
  @ApiOperation({ summary: ClassSimulationConstants.SWAGGER.REMOVE })
  async remove(@Param('id') id: string,@Req() req: types.JwtRequest): Promise<ApiResponse<null>> {
    const userId = req.user.userId;
    const result = await this.service.remove(id,userId);
    if (!result.success) throwAppError(result.message!, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: null };
  }
}
