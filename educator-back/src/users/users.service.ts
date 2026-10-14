import { Injectable, BadRequestException } from '@nestjs/common';

import { CreateUserDto } from './dto/user.dto';
import { ServiceResponse } from 'src/common/types';
import { ErrorTypes } from 'src/common/utils/messages';
import { UserConstants } from './users.constants';
import { FormattedUser } from 'src/common/types';
import { CommonStatus } from 'src/common/enums/status.enum';
import { InvitesService } from '../invites/invites.service';
import { Inject, forwardRef } from '@nestjs/common';
import { AuthConstants } from 'src/auth/auth.constants';
import { throwAppError } from '../common/utils/app-error';
import { AzureBlobService, LoggerService } from 'src/common/services';
import { ConfigService } from '@nestjs/config';
import { User, Role, DistrictAdmin } from 'src/database/entities';
import {
  DISTRICT_ADMIN_REPOSITORY,
  EDUCATOR_REPOSITORY,
  ROLE_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from 'src/database/tokens';
import {
  DistrictAdminRepository,
  EducatorRepository,
  RoleRepository,
  UserRepository,
  UserRoleRepository,
} from 'src/database/repositories';
import { DatabaseService } from 'src/database/services/database.service';
import { RoleSlug, UserTokenType } from 'src/common/constants';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY)
    private usersRepo: UserRepository,

    private readonly configService: ConfigService,
    @Inject(ROLE_REPOSITORY)
    private roleRepo: RoleRepository,

    @Inject(EDUCATOR_REPOSITORY)
    private educatorRepo: EducatorRepository,

    @Inject(USER_ROLE_REPOSITORY)
    private readonly userRoleRepo: UserRoleRepository,

    @Inject(DISTRICT_ADMIN_REPOSITORY)
    private readonly districtAdminRepo: DistrictAdminRepository,

    @Inject(forwardRef(() => InvitesService))
    private readonly invitesService: InvitesService,
    private readonly azureBlobService: AzureBlobService,
    private databaseService: DatabaseService,
    private readonly logger: LoggerService,
  ) { }

  /**
   * `fullName`/`profilePicture`/`isLicenseActive`/`subscriptions` no longer live on `User` —
   * they moved to `DistrictAdmin` (district-admin-plan.md). Every admin `User` is expected to
   * have a linked District Admin role assignment after the Phase 2 backfill migration.
   */
  private async getDistrictAdminForUser(
    userId: string,
  ): Promise<{ userRoleId: string; districtAdmin: DistrictAdmin | null } | null> {
    const userRole = await this.userRoleRepo.findByUserAndRoleSlug(userId, RoleSlug.DISTRICT_ADMIN);
    if (!userRole) return null;
    const districtAdmin = await this.districtAdminRepo.findByUserRoleId(userRole.userRoleId);
    return { userRoleId: userRole.userRoleId, districtAdmin };
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.usersRepo.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async save(user: Partial<User>): Promise<User> {
    if (!user.id) {
      // const newUser = this.usersRepo.create(user);
      return await this.usersRepo.create(user);
    } else {
      await this.usersRepo.update(user.id, user);
      return (await this.usersRepo.findOne({ where: { id: user.id } }))!;
    }
  }

  async updateByEmail(email: string, updateData: Partial<User>): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.usersRepo.findOne({ where: { email: normalizedEmail } });
    if (!user) return null;

    Object.assign(user, updateData);
    await this.usersRepo.update(user.id, user);
    return user;
  }

  async findBySubscriptionCode(code: string): Promise<User | null> {
    return await this.databaseService.connection
      .createQueryBuilder(User, 'user')
      .innerJoin('user.userRoles', 'user_role')
      .innerJoin('district_admins', 'district_admin', 'district_admin.user_role_id = user_role.user_role_id')
      .where('district_admin.subscriptions::jsonb @> :code::jsonb', {
        code: JSON.stringify([{ redeem_code: code.toUpperCase() }]),
      })
      .getOne();
  }

  async findAll(): Promise<ServiceResponse<FormattedUser[]>> {
    const users = await this.usersRepo.find({
      relations: { userRoles: { role: true, districtAdmin: true } },
      order: { created_at: 'DESC' },
    });

    const formattedUsers: FormattedUser[] = users.map((user) => {
      const districtAdmin = user.userRoles?.find((ur) => ur.districtAdmin)?.districtAdmin;
      // `users.role_id` is no longer mapped — role membership lives only on `user_roles`. The
      // response keeps a single `role` for backward compatibility, resolved to the account's
      // first ACTIVE assignment (falling back to its first assignment of any status).
      const primaryRole =
        user.userRoles?.find((ur) => ur.status === CommonStatus.ACTIVE && ur.role)?.role ??
        user.userRoles?.find((ur) => ur.role)?.role ??
        null;
      return {
        id: user.id,
        email: user.email,
        fullName: districtAdmin?.fullName ?? '',
        status: user.status,
        role: primaryRole ? { id: primaryRole.id, role_name: primaryRole.role_name } : null,
        parent_id: null,
        school: null,
      };
    });

    return {
      success: true,
      message: UserConstants.MESSAGES.FETCHED,
      data: formattedUsers,
    };
  }

  async findById(id: string): Promise<ServiceResponse<User>> {
    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['userRoles', 'userRoles.districtAdmin'],
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
    return {
      success: true,
      message: UserConstants.MESSAGES.FETCHED,
      data: userWithoutPassword,
    };
  }

  async createUser(userDto: CreateUserDto): Promise<User> {
    if (userDto.invite_id) {
      const inviteEntity = await this.invitesService.findInviteById(userDto.invite_id);
      if (!inviteEntity) {
        throw new BadRequestException('Invalid invite ID');
      }
      const invite = await this.invitesService.markInviteAccepted(inviteEntity);
      if (invite) {
        if (invite.email.toLowerCase() !== userDto.email.toLowerCase()) {
          throw new BadRequestException(AuthConstants.MESSAGES.INVITE_EMAIL_MISMATCH);
        }
      }
    }

    let role: Role | null;
    if (userDto.role_id) {
      role = await this.roleRepo.findOne({ where: { id: userDto.role_id } });
      if (!role) {
        throwAppError(`Role with ID ${userDto.role_id} not found.`);
      }
    } else {
      const slug = userDto.invite_id
        ? RoleSlug.EDUCATOR
        : RoleSlug.DISTRICT_ADMIN;

      role = await this.roleRepo.findOne({ where: { slug } });

      if (!role) {
        throwAppError(`${UserConstants.MESSAGES.ROLE_MISSING} [${role?.['role_name']}]`);
      }
    }

    return await this.usersRepo.createUserWithRole({
      email: userDto.email,
      password: userDto.password,
      status: userDto.status,
      roleId: role.id,
      roleSlug: role.slug ?? undefined,
      fullName: userDto.full_name,
    });
  }

  private async sanitizeProfilePicture(value?: string): Promise<string> {
    if (!value || !value.startsWith('http')) return '';
    return this.azureBlobService.generateSasUrl(value);
  }

  async updateProfile(
    id: string,
    body: { fullName?: string; profilePictureUrl?: string },
    file?: Express.Multer.File,
  ): Promise<ServiceResponse<{ id: string; fullName: string; profilePicture: string | null }>> {
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

      const linkedDistrictAdmin = await this.getDistrictAdminForUser(id);
      if (!linkedDistrictAdmin) {
        this.logger.warn(`[updateProfile:user] No linked District Admin role for user: ${id}`);
        return {
          success: false,
          message: UserConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      const { userRoleId } = linkedDistrictAdmin;
      const profile: { fullName?: string; profilePicture?: string } = {
        fullName: linkedDistrictAdmin.districtAdmin?.fullName,
        profilePicture: linkedDistrictAdmin.districtAdmin?.profilePicture ?? undefined,
      };

      if (body.fullName) {
        this.logger.log(
          `[updateProfile:user] Updating fullName: ${profile.fullName} → ${body.fullName}`,
        );
        profile.fullName = body.fullName;
      }

      const isAzureConfigured =
        typeof this.azureBlobService.isConfigured === 'function' &&
        this.azureBlobService.isConfigured();

      this.logger.log(`[updateProfile] azureBlobService.isConfigured: ${isAzureConfigured}`);
      this.logger.log(`[updateProfile] file provided: ${!!file}`);
      this.logger.log(`[updateProfile] profilePictureUrl: ${body.profilePictureUrl ?? 'none'}`);

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
            profile.profilePicture = await this.azureBlobService.uploadFile(
              file.buffer,
              blobName,
              file.mimetype,
            );
            this.logger.log(
              `[updateProfile:user] Azure upload SUCCESS - URL: ${profile.profilePicture}`,
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
          if (body.profilePictureUrl?.startsWith('http')) {
            this.logger.warn(
              `[updateProfile:user] Using fallback URL: ${body.profilePictureUrl}`,
            );
            profile.profilePicture = body.profilePictureUrl;
          } else {
            this.logger.warn(
              `[updateProfile:user] No valid fallback URL — profile picture unchanged`,
            );
          }
        }
      } else if (body.profilePictureUrl) {
        if (body.profilePictureUrl.startsWith('blob:')) {
          this.logger.warn(
            `[updateProfile:user] Blob URL rejected (client-side URL): ${body.profilePictureUrl}`,
          );
          return {
            success: false,
            message: 'Blob URLs are not valid. Upload the file directly.',
            type: ErrorTypes.BAD_REQUEST,
          };
        }
        if (body.profilePictureUrl.startsWith('http')) {
          this.logger.log(
            `[updateProfile:user] Setting profilePicture from URL: ${body.profilePictureUrl}`,
          );
          profile.profilePicture = body.profilePictureUrl;
        }
      }

      this.logger.log(
        `[updateProfile:user] Saving district admin record. profile_picture value: ${profile.profilePicture ?? 'null'}`,
      );

      await this.districtAdminRepo.updateByUserRoleId(userRoleId, {
        fullName: profile.fullName,
        profilePicture: profile.profilePicture,
      });
      const rawPicture = profile.profilePicture?.replace(/["'\s]+$/, '').startsWith('http')
        ? profile.profilePicture.replace(/["'\s]+$/, '')
        : null;
      const profilePictureUser = rawPicture
        ? await this.azureBlobService.generateSasUrl(rawPicture)
        : null;

      this.logger.log(
        `[updateProfile:user] SUCCESS - user: ${id}, profilePicture: ${profilePictureUser ? 'set' : 'null'}`,
      );

      return {
        success: true,
        message: UserConstants.MESSAGES.UPDATED,
        data: {
          id: user.id,
          fullName: profile.fullName ?? '',
          profilePicture: profilePictureUser,
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

  async getProfilePicture(userId: string, type?: UserTokenType): Promise<string | null> {
    if (type === UserTokenType.EDUCATOR) {
      const educator = await this.educatorRepo.findOne({ where: { userRole: { userId } } });
      if (!educator) {
        return null;
      }
      const picture = this.sanitizeProfilePicture(educator.profile_picture);
      return picture;
    }

    const linkedDistrictAdmin = await this.getDistrictAdminForUser(userId);
    if (!linkedDistrictAdmin) {
      return null;
    }
    const picture = this.sanitizeProfilePicture(
      linkedDistrictAdmin.districtAdmin?.profilePicture ?? '',
    );
    return picture;
  }
  async removeProfilePhoto(
    id: string,
    type?: UserTokenType,
  ): Promise<ServiceResponse<{ id: string; profilePicture: null }>> {
    if (type === UserTokenType.EDUCATOR) {
      // `id` is the caller's `users.id`, so resolve the educator through its linked `user_roles`
      // row rather than matching it against `educators.id` — same as `getProfilePicture` above.
      const educator = await this.educatorRepo.findOne({
        where: { userRole: { userId: id }, is_active: true },
      });
      if (!educator) {
        return {
          success: false,
          message: UserConstants.MESSAGES.NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }
      educator.profile_picture = '';
      await this.educatorRepo.update(educator.id, educator);
      return {
        success: true,
        message: 'Profile photo removed successfully',
        data: { id: educator.id, profilePicture: null },
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

    const linkedDistrictAdmin = await this.getDistrictAdminForUser(id);
    if (!linkedDistrictAdmin) {
      return {
        success: false,
        message: UserConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    await this.districtAdminRepo.updateByUserRoleId(linkedDistrictAdmin.userRoleId, {
      profilePicture: null,
    });

    return {
      success: true,
      message: 'Profile photo removed successfully',
      data: { id: user.id, profilePicture: null },
    };
  }
}
