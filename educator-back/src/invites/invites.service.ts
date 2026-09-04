import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invite, InviteStatus } from './entity/invite.entity';
import { User } from '../users/entity/user.entity';
import { Schools } from 'src/schools/entity/schools.entity';
import { Educator } from '../educators/entity/educator.entity';
import { EducatorSchool } from '../educators/entity/educator-school.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Role } from '../roles/entity/role.entity';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { InvitesConstants } from './invites.constants';
import { EducatorConstants } from '../educators/educators.constants';
import { ServiceResponse, SubscriptionSummary } from 'src/common/types';
import { CreateInviteDto, InviteCreateResponse, InviteDetails } from './dto/invites.dto';

@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(Invite)
    private readonly inviteRepo: Repository<Invite>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Schools)
    private readonly schoolRepo: Repository<Schools>,

    @InjectRepository(Educator)
    private readonly educatorRepo: Repository<Educator>,

    @InjectRepository(EducatorSchool)
    private readonly educatorSchoolRepo: Repository<EducatorSchool>,

    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,

    private readonly mailerService: MailService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}
  //TODO: To be moved to migration file

  onModuleInit(): void {
    void this.ensureColumn();
  }

  private async ensureColumn(): Promise<void> {
    await this.dataSource.query(`
    ALTER TABLE invites
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS full_name VARCHAR NULL;
  `);
  }
  async findCreatorById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findSchoolByOwner(schoolId: string, ownerId: string): Promise<Schools | null> {
    return this.schoolRepo.findOne({
      where: { id: schoolId, user_id: { id: ownerId }, is_active: true },
    });
  }

  async findEducatorByEmail(email: string): Promise<Educator | null> {
    return this.educatorRepo.findOne({
      where: { email: email.trim().toLowerCase() },
      relations: ['school', 'admin', 'role'],
    });
  }

  async findPendingInviteByEmail(email: string): Promise<Invite | null> {
    return this.inviteRepo.findOne({
      where: { email: email.trim().toLowerCase(), status: InviteStatus.PENDING },
    });
  }

  async findRoleByName(name: string): Promise<Role | null> {
    return this.roleRepo.findOne({ where: { role_name: name } });
  }

  async findInviteById(id: string): Promise<Invite | null> {
    return this.inviteRepo.findOne({
      where: { id },
      relations: ['school', 'createdBy'],
    });
  }

  async createInvite(
    dto: CreateInviteDto,
    creator: User,
    school: Schools,
    educatorRole: Role | null,
    existingEducator: Educator | null,
  ): Promise<ServiceResponse<InviteCreateResponse>> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    if (dto.tokens) {
      const subscriptions = (creator.subscriptions as SubscriptionSummary[]) || [];
      const sortedSubs = [...subscriptions].sort(
        (a, b) => new Date(a.end).getTime() - new Date(b.end).getTime(),
      );
      const totalAvailable = sortedSubs.reduce((sum, sub) => sum + (sub.seats_available || 0), 0);

      if (totalAvailable < dto.tokens) {
        throw new BadRequestException(
          InvitesConstants.MESSAGES.INSUFFICIENT_SEATS(totalAvailable, dto.tokens),
        );
      }

      let tokensRemaining = dto.tokens;
      for (const sub of sortedSubs) {
        if (tokensRemaining <= 0) break;
        const available = sub.seats_available || 0;
        if (available <= 0) continue;
        const deduct = Math.min(available, tokensRemaining);
        sub.seats_available = available - deduct;
        tokensRemaining -= deduct;
      }

      creator.subscriptions = subscriptions;
      await this.userRepo.save(creator);
    }

    const createStatus =
      dto.status === CommonStatus.INACTIVE ? CommonStatus.INACTIVE : CommonStatus.PENDING;
    const upsertResult = await this.educatorRepo
      .createQueryBuilder()
      .insert()
      .into(Educator)
      .values({
        email: normalizedEmail,
        password: null,
        full_name: dto.full_name?.trim() ?? existingEducator?.full_name ?? undefined,
        status: createStatus,
        is_active: true,
        deleted_at: null,
        school: { id: school.id },
        phone_number: dto.phone_number ?? existingEducator?.phone_number ?? undefined,
        admin: { id: creator.id },
        role: educatorRole ? { id: educatorRole.id } : null,
        tokens: dto.tokens ?? existingEducator?.tokens ?? 0,
      })
      .orUpdate(
        [
          'is_active',
          'deleted_at',
          'status',
          'full_name',
          'phone_number',
          'password',
          'school_id',
          'admin_id',
          'role_id',
          'tokens',
        ],

        ['email'],
      )
      .returning('id')
      .execute();

    const raw = upsertResult.raw as { id: string }[];
    const upsertedId = raw[0]?.id;
    const savedEducator = await this.educatorRepo.findOne({
      where: upsertedId ? { id: upsertedId } : { email: normalizedEmail },
    });

    if (!savedEducator) {
      throw new BadRequestException('Failed to create or retrieve educator');
    }

    // Ensure a junction row exists in educator_schools for this invite's school.
    // This is idempotent: if the row already exists (re-invite scenario) it is
    // not duplicated.  The first school assigned to an educator becomes primary.
    const existingJunctionCount = await this.educatorSchoolRepo.count({
      where: { educator: { id: savedEducator.id } },
    });
    const isPrimary = existingJunctionCount === 0;
    await this.educatorSchoolRepo.upsert(
      [{ educator: { id: savedEducator.id }, school: { id: school.id }, is_primary: isPrimary }],
      { conflictPaths: ['educator', 'school'], skipUpdateIfNoValuesChanged: true },
    );

    await this.inviteRepo.delete({ email: normalizedEmail });

    const expires_at = new Date();
    expires_at.setMinutes(expires_at.getMinutes() + InvitesConstants.INVITE_EXPIRY_MINUTES);

    const savedInvite = await this.inviteRepo.save(
      this.inviteRepo.create({
        full_name: dto.full_name?.trim() ?? undefined,
        email: normalizedEmail,
        school,
        createdBy: creator,
        status: InviteStatus.PENDING,
        expires_at,
      }),
    );

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const inviteUrl = `${frontendUrl}/signup/${savedInvite.id}`;
    const logoUrl = this.configService.get<string>('EMAIL_LOGO_URL') || '';

    if (dto.status !== CommonStatus.INACTIVE) {
      await this.mailerService
        .sendMail({
          to: dto.email,
          subject: InvitesConstants.MESSAGES.EMAIL_SUBJECT,
          template: InvitesConstants.MESSAGES.TEMPLATE_NAME,
          context: {
            fullName: dto.full_name || InvitesConstants.EMAIL_DEFAULTS.FULL_NAME,
            creatorName: creator.full_name || InvitesConstants.EMAIL_DEFAULTS.CREATOR_NAME,
            schoolName: school.school_name || InvitesConstants.EMAIL_DEFAULTS.SCHOOL_NAME,
            inviteUrl,
            logoUrl,
            expiryMinutes: InvitesConstants.INVITE_EXPIRY_MINUTES,
          },
        })
        .catch((error) => {
          console.error(InvitesConstants.LOG.EMAIL_SEND_FAILED, error);
        });
    }

    const message =
      dto.status === CommonStatus.INACTIVE
        ? EducatorConstants.MESSAGES.CREATED
        : InvitesConstants.MESSAGES.INVITE_SENT;

    return {
      success: true,
      message,
      data: { invite: savedInvite, educator: savedEducator },
    };
  }

  async verifyInvite(invite: Invite): Promise<ServiceResponse<Invite>> {
    await this.inviteRepo.findOne({ where: { id: invite.id }, relations: ['school', 'createdBy'] });
    return { success: true, message: InvitesConstants.MESSAGES.VALID_INVITE, data: invite };
  }

  async acceptInvite(invite: Invite): Promise<Invite> {
    invite.status = InviteStatus.ACCEPTED;
    invite.is_active = false;
    invite.deleted_at = new Date();
    await this.inviteRepo.save(invite);
    return invite;
  }

  async getInviteDetails(invite: Invite): Promise<ServiceResponse<InviteDetails>> {
    const educator = await this.educatorRepo.findOne({ where: { email: invite.email } });
    return {
      success: true,
      data: { email: invite.email, full_name: educator?.full_name || '' },
    };
  }
}
