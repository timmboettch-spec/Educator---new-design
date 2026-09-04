import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entity/product.entity';
import { User } from '../users/entity/user.entity';
import { ProductDto } from './dto/product.dto';
import { ServiceResponse } from 'src/common/types';
import { Messages, ErrorTypes } from 'src/common/utils/messages';
import { CommonStatus } from 'src/common/enums/status.enum';
import { ProductConstants } from './products.constants';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly tutorPatientService: TutorPatientService,
  ) {}

  async create(userId: string, dto: ProductDto): Promise<ServiceResponse<Product>> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.status !== CommonStatus.ACTIVE) {
      return { success: false, message: Messages.USER_NOT_FOUND, type: ErrorTypes.UNAUTHORIZED };
    }

    const exists = await this.productRepo.findOne({
      where: { title: dto.title, user_id: { id: userId } },
    });
    if (exists) {
      return { success: false, message: Messages.PRODUCT_EXISTS, type: ErrorTypes.BAD_REQUEST };
    }

    const product = this.productRepo.create({
      title: dto.title,
      value: dto.value,
      icon: dto.icon,
      meta: dto.meta ?? null,
      status: dto.status ?? CommonStatus.ACTIVE,
      user_id: { id: userId },
    });

    const saved = await this.productRepo.save(product);
    const result = await this.productRepo.findOne({
      where: { id: saved.id },
      relations: ['user_id'],
    });

    return { success: true, message: Messages.PRODUCT_CREATED, data: result! };
  }

  async findAllBundles(bundle_name: string): Promise<ServiceResponse<Record<string, unknown>>> {
    try {
      const bundle = await this.tutorPatientService.getFile(`${bundle_name}.json`, true);
      if (!bundle) {
        return {
          success: false,
          message: ProductConstants.VALIDATION.BUNDLE_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      return {
        success: true,
        message: ProductConstants.VALIDATION.BUNDLE_FETCHED,
        data: JSON.parse(bundle) as Record<string, unknown>,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to fetch bundle';
      return { success: false, message: errorMsg, type: ErrorTypes.INTERNAL_SERVER_ERROR };
    }
  }

  async findAll(userId: string): Promise<ServiceResponse<Product[]>> {
    const items = await this.productRepo
      .createQueryBuilder('product')
      .where('product.user_id = :userId', { userId })
      .orderBy('product.created_at', 'DESC')
      .getMany();

    return { success: true, message: Messages.PRODUCT_FETCHED, data: items };
  }

  async findOne(id: string, userId: string): Promise<ServiceResponse<Product>> {
    const product = await this.productRepo.findOne({
      where: { id, user_id: { id: userId } },
      relations: ['user_id'],
    });

    if (!product) {
      return { success: false, message: Messages.PRODUCT_NOT_FOUND, type: ErrorTypes.NOT_FOUND };
    }

    return { success: true, message: Messages.PRODUCT_FETCHED, data: product };
  }

  async update(id: string, userId: string, dto: ProductDto): Promise<ServiceResponse<Product>> {
    const product = await this.productRepo.findOne({
      where: { id, user_id: { id: userId } },
      relations: ['user_id'],
    });

    if (!product) {
      return { success: false, message: Messages.PRODUCT_NOT_FOUND, type: ErrorTypes.NOT_FOUND };
    }

    if (dto.title !== undefined) product.title = dto.title;
    if (dto.value !== undefined) product.value = dto.value;
    if (dto.icon !== undefined) product.icon = dto.icon;
    if (dto.meta !== undefined) product.meta = dto.meta;
    if (dto.status !== undefined) product.status = dto.status;

    const updated = await this.productRepo.save(product);
    const result = await this.productRepo.findOne({
      where: { id: updated.id },
      relations: ['user_id'],
    });

    return { success: true, message: Messages.PRODUCT_UPDATED, data: result! };
  }

  async remove(id: string, userId: string): Promise<ServiceResponse<null>> {
    const product = await this.productRepo.findOne({
      where: { id, user_id: { id: userId } },
    });

    if (!product) {
      return { success: false, message: Messages.PRODUCT_NOT_FOUND, type: ErrorTypes.NOT_FOUND };
    }

    await this.productRepo.remove(product);
    return { success: true, message: Messages.PRODUCT_DELETED, data: null };
  }
}
