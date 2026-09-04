import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entity/user.entity';
import { Role } from '../roles/entity/role.entity';
import { Educator } from '../educators/entity/educator.entity';
import { CreateUserDto } from './dto/user.dto';
import { ServiceResponse } from 'src/common/types';
import { ErrorTypes } from 'src/common/utils/messages';
import { UserConstants } from './users.constants';
import * as bcrypt from 'bcrypt';
import { FormattedUser } from 'src/common/types';
import { InvitesService } from '../invites/invites.service';
import { Inject, forwardRef } from '@nestjs/common';
import { AuthConstants } from 'src/auth/auth.constants';
import { throwAppError } from '../common/utils/app-error';
import { AzureBlobService } from 'src/config/azure-blob.config';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,

    private readonly configService: ConfigService,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,

    @InjectRepository(Educator)
    private educatorRepo: Repository<Educator>,

    @Inject(forwardRef(() => InvitesService))
    private readonly invitesService: InvitesService,
    private readonly azureBlobService: AzureBlobService,
  ) { }

  async findByEmail(email: string): Promise<User | null> {
    return await this.usersRepo.findOne({
      where: { email: email.trim().toLowerCase() },
      relations: ['role'],
    });
  }

  async save(user: Partial<User>): Promise<User> {
    if (!user.id) {
      const newUser = this.usersRepo.create(user);
      return await this.usersRepo.save(newUser);
    } else {
      await this.usersRepo.update(user.id, user);
      return (await this.usersRepo.findOne({ where: { id: user.id }, relations: ['role'] }))!;
    }
  }

  async updateByEmail(email: string, updateData: Partial<User>): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.usersRepo.findOne({ where: { email: normalizedEmail } });
    if (!user) return null;

    Object.assign(user, updateData);
    return this.usersRepo.save(user);
  }

  async findBySubscriptionCode(code: string): Promise<User | null> {
    return await this.usersRepo
      .createQueryBuilder('user')
      .where('"user"."subscriptions"::jsonb @> :code::jsonb', {
        code: JSON.stringify([{ redeem_code: code.toUpperCase() }]),
      })
      .getOne();
  }

  async findAll(): Promise<ServiceResponse<FormattedUser[]>> {
    const users = await this.usersRepo.find({
      relations: ['role'],
      order: { created_at: 'DESC' },
    });

    const formattedUsers: FormattedUser[] = users.map((user) => ({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      status: user.status,
      role: user.role ? { id: user.role.id, role_name: user.role.role_name } : null,
      parent_id: null,
      school: null,
    }));

    return {
      success: true,
      message: UserConstants.MESSAGES.FETCHED,
      data: formattedUsers,
    };
  }

  async findById(id: string): Promise<ServiceResponse<User>> {
    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['role'],
    });
    if (!user) {
      return {
        success: false,
        message: UserConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    const { password, ...userWithoutPassword } = user;
    void password;
    userWithoutPassword.profile_picture = await this.sanitizeProfilePicture(
      userWithoutPassword.profile_picture ?? '',
    );
    return {
      success: true,
      message: UserConstants.MESSAGES.FETCHED,
      data: userWithoutPassword as User,
    };
  }

  async createUser(userDto: CreateUserDto): Promise<User> {
    if (userDto.invite_id) {
      const inviteEntity = await this.invitesService.findInviteById(userDto.invite_id);
      if (!inviteEntity) {
        throw new BadRequestException('Invalid invite ID');
      }
      const invite = await this.invitesService.acceptInvite(inviteEntity);
      if (invite) {
        if (invite.email.toLowerCase() !== userDto.email.toLowerCase()) {
          throw new BadRequestException(AuthConstants.MESSAGES.INVITE_EMAIL_MISMATCH);
        }
      }
    }

    let role: Role | null = null;
    if (userDto.role_id) {
      role = await this.roleRepo.findOne({ where: { id: userDto.role_id } });
      if (!role) {
        throwAppError(`Role with ID ${userDto.role_id} not found.`);
      }
    } else {
      const role_name = userDto.invite_id
        ? UserConstants.ROLES.EDUCATOR
        : UserConstants.ROLES.DISTRICT_ADMIN;

      role = await this.roleRepo.findOne({ where: { role_name } });

      if (!role) {
        throwAppError(`${UserConstants.MESSAGES.ROLE_MISSING} [${role_name}]`);
      }
    }

    const user = this.usersRepo.create({
      email: userDto.email,
      password: userDto.password,
      full_name: userDto.full_name,
      status: userDto.status,
      role,
    });

    return await this.usersRepo.save(user);
  }

  private async sanitizeProfilePicture(value?: string): Promise<string> {
    if (!value || !value.startsWith('http')) return '';
    return this.azureBlobService.generateSasUrl(value);
  }

  async updateProfile(
    id: string,
    body: { full_name?: string; profile_picture_url?: string },
    file?: Express.Multer.File,
  ): Promise<ServiceResponse<{ id: string; full_name: string; profile_picture: string | null }>> {
    try {
      const user = await this.usersRepo.findOne({ where: { id } });
      if (!user) {
        this.logger.warn(`[updateProfile:user] User not found: ${id}`);
        return {
          success: false,
          message: UserConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      if (body.full_name) {
        this.logger.log(
          `[updateProfile:user] Updating full_name: ${user.full_name} → ${body.full_name}`,
        );
        user.full_name = body.full_name;
      }

      const isAzureConfigured =
        typeof this.azureBlobService.isConfigured === 'function' &&
        this.azureBlobService.isConfigured();

      this.logger.log(`[updateProfile] azureBlobService.isConfigured: ${isAzureConfigured}`);
      this.logger.log(`[updateProfile] file provided: ${!!file}`);
      this.logger.log(`[updateProfile] profile_picture_url: ${body.profile_picture_url ?? 'none'}`);

      if (file) {
        const ext = file.originalname.split('.').pop();
        const blobName = `profile-pictures/user-${id}-${Date.now()}.${ext}`;
        this.logger.log(
          `[updateProfile:user] File upload initiated - name: ${file.originalname}, size: ${file.size} bytes, mime: ${file.mimetype}`,
        );
        this.logger.log(`[updateProfile:user] Blob name: ${blobName}`);
        if (isAzureConfigured) {
          this.logger.log(`[updateProfile:user] Starting Azure Blob upload...`);
          try {
            user.profile_picture = await this.azureBlobService.uploadFile(
              file.buffer,
              blobName,
              file.mimetype,
            );
            this.logger.log(
              `[updateProfile:user] Azure upload SUCCESS - URL: ${user.profile_picture}`,
            );
          } catch (uploadError) {
            this.logger.error(
              `[updateProfile:user] Azure uploadFile FAILED: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`,
            );
            this.logger.error(
              `[updateProfile] Azure error stack: ${uploadError instanceof Error ? uploadError.stack : 'n/a'}`,
            );
            throw uploadError;
          }
        } else {
          this.logger.warn(`[updateProfile:user] Azure not configured — skipping file upload`);
          if (body.profile_picture_url?.startsWith('http')) {
            this.logger.warn(
              `[updateProfile:user] Using fallback URL: ${body.profile_picture_url}`,
            );
            user.profile_picture = body.profile_picture_url;
          } else {
            this.logger.warn(
              `[updateProfile:user] No valid fallback URL — profile picture unchanged`,
            );
          }
        }
      } else if (body.profile_picture_url) {
        if (body.profile_picture_url.startsWith('blob:')) {
          this.logger.warn(
            `[updateProfile:user] Blob URL rejected (client-side URL): ${body.profile_picture_url}`,
          );
          return {
            success: false,
            message: 'Blob URLs are not valid. Upload the file directly.',
            type: ErrorTypes.BAD_REQUEST,
          };
        }
        if (body.profile_picture_url.startsWith('http')) {
          this.logger.log(
            `[updateProfile:user] Setting profile_picture from URL: ${body.profile_picture_url}`,
          );
          user.profile_picture = body.profile_picture_url;
        }
      }

      this.logger.log(
        `[updateProfile:user] Saving user record. profile_picture value: ${user.profile_picture ?? 'null'}`,
      );
      await this.usersRepo.save(user);
      const rawPicture = user.profile_picture?.replace(/["'\s]+$/, '').startsWith('http')
        ? user.profile_picture.replace(/["'\s]+$/, '')
        : null;
      const profile_picture_user = rawPicture
        ? await this.azureBlobService.generateSasUrl(rawPicture)
        : null;

      this.logger.log(
        `[updateProfile:user] SUCCESS - user: ${id}, profile_picture: ${profile_picture_user ? 'set' : 'null'}`,
      );

      return {
        success: true,
        message: UserConstants.MESSAGES.UPDATED,
        data: {
          id: user.id,
          full_name: user.full_name,
          profile_picture: profile_picture_user,
        },
      };
    } catch (error) {
      this.logger.error(
        `[updateProfile] Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.error(`[updateProfile] Stack: ${error instanceof Error ? error.stack : 'n/a'}`);
      return {
        success: false,
        message: 'Failed to update profile',
        type: ErrorTypes.INTERNAL_SERVER_ERROR,
      };
    }
  }

  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<ServiceResponse<null>> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (user) {
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch)
        return {
          success: false,
          message: 'Old password is incorrect',
          type: ErrorTypes.BAD_REQUEST,
        };
      const hashed = await bcrypt.hash(newPassword, 10);
      user.password = hashed;
      await this.usersRepo.save(user);
      const dualEducator = await this.educatorRepo.findOne({ where: { email: user.email } });
      if (dualEducator) {
        dualEducator.password = hashed;
        await this.educatorRepo.save(dualEducator);
      }
      return { success: true, message: 'Password changed successfully', data: null };
    }

    const educator = await this.educatorRepo.findOne({ where: { id } });
    if (educator) {
      const isMatch = await bcrypt.compare(oldPassword, educator.password ?? '');
      if (!isMatch)
        return {
          success: false,
          message: 'Old password is incorrect',
          type: ErrorTypes.BAD_REQUEST,
        };
      const hashed = await bcrypt.hash(newPassword, 10);
      educator.password = hashed;
      await this.educatorRepo.save(educator);
      // Dual-role sync: mirror the update onto the users table if the same
      // email is registered as an Administrator there.
      const dualUser = await this.usersRepo.findOne({ where: { email: educator.email } });
      if (dualUser) {
        dualUser.password = hashed;
        await this.usersRepo.save(dualUser);
      }
      return { success: true, message: 'Password changed successfully', data: null };
    }

    return {
      success: false,
      message: UserConstants.MESSAGES.NOT_FOUND,
      type: ErrorTypes.NOT_FOUND,
    };
  }

  async getProfilePicture(userId: string, type?: string): Promise<string | null> {
    if (type === 'educator') {
      const educator = await this.educatorRepo.findOne({ where: { id: userId } });
      if (!educator) {
        return null;
      }
      const picture = this.sanitizeProfilePicture(educator.profile_picture);
      return picture;
    }

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }
    const picture = this.sanitizeProfilePicture(user.profile_picture ?? '');
    return picture;
  }
  async removeProfilePhoto(
    id: string,
    type?: string,
  ): Promise<ServiceResponse<{ id: string; profile_picture: null }>> {
    if (type === 'educator') {
      const educator = await this.educatorRepo.findOne({ where: { id, is_active: true } });
      if (!educator) {
        return {
          success: false,
          message: UserConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      educator.profile_picture = '';
      await this.educatorRepo.save(educator);
      return {
        success: true,
        message: 'Profile photo removed successfully',
        data: { id: educator.id, profile_picture: null },
      };
    }

    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      return {
        success: false,
        message: UserConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    user.profile_picture = null;
    await this.usersRepo.save(user);

    return {
      success: true,
      message: 'Profile photo removed successfully',
      data: { id: user.id, profile_picture: null },
    };
  }
}
