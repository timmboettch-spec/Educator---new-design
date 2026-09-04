import { Controller, Post, Get, Put, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductDto } from './dto/product.dto';
import { ProductConstants } from './products.constants';
import { Messages, AppStatus } from 'src/common/utils/messages';
import { ApiResponse } from 'src/common/types';
import { throwAppError } from 'src/common/utils/app-error';
import * as types from 'src/common/types';

@ApiTags(ProductConstants.SWAGGER.TAG)
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT-auth')
@Controller(ProductConstants.ROUTES.BASE)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  async create(@Body() dto: ProductDto, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const result = await this.productsService.create(req.user.userId, dto);
    if (!result.success)
      throwAppError(result.message || Messages.FAILED_TO_SAVE_PRODUCT, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(ProductConstants.ROUTES.USER)
  async findAll(@Req() req: types.JwtRequest): Promise<ApiResponse> {
    const result = await this.productsService.findAll(req.user.userId);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get(ProductConstants.ROUTES.ID)
  async findOne(@Param('id') id: string, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const result = await this.productsService.findOne(id, req.user.userId);
    if (!result.success) throwAppError(result.message || Messages.PRODUCT_NOT_FOUND, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Put(ProductConstants.ROUTES.ID)
  async update(
    @Param('id') id: string,
    @Body() dto: ProductDto,
    @Req() req: types.JwtRequest,
  ): Promise<ApiResponse> {
    const result = await this.productsService.update(id, req.user.userId, dto);
    if (!result.success) throwAppError(result.message || Messages.PRODUCT_NOT_FOUND, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Delete(ProductConstants.ROUTES.ID)
  async remove(@Param('id') id: string, @Req() req: types.JwtRequest): Promise<ApiResponse> {
    const result = await this.productsService.remove(id, req.user.userId);
    if (!result.success) throwAppError(result.message || Messages.PRODUCT_NOT_FOUND, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }

  @Get('bundle/:bundle_name')
  async findAllBundles(@Param('bundle_name') bundle_name: string): Promise<ApiResponse> {
    const result = await this.productsService.findAllBundles(bundle_name);
    if (!result.success)
      throwAppError(result.message || ProductConstants.VALIDATION.BUNDLE_NOT_FOUND, result.type);
    return { status: AppStatus.SUCCESS, message: result.message!, data: result.data };
  }
}
