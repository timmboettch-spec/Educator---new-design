import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Invite, InviteStatus } from './entity/invite.entity';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { InvitesService } from './invites.service';
import {
  CreateInviteDto,
  VerifyInviteDto,
  InviteCreateResponse,
  InviteDetails,
} from './dto/invites.dto';
import type { JwtRequest, ServiceResponse } from '../common/types';
import { InvitesConstants } from './invites.constants';

@ApiTags(InvitesConstants.SWAGGER.TAG)
@Controller(InvitesConstants.ROUTES.BASE)
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post(InvitesConstants.ROUTES.CREATE)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: InvitesConstants.SWAGGER.SUMMARY_CREATE })
  async createInvite(
    @Body() dto: CreateInviteDto,
    @Req() req: JwtRequest,
  ): Promise<ServiceResponse<InviteCreateResponse>> {
    const creatorId = req.user?.userId;

    const creator = await this.invitesService.findCreatorById(creatorId);
    if (!creator) throw new NotFoundException(InvitesConstants.MESSAGES.CREATOR_NOT_FOUND);

    const school = await this.invitesService.findSchoolByOwner(dto.school_id, creatorId);
    if (!school) throw new NotFoundException(InvitesConstants.MESSAGES.SCHOOL_NOT_FOUND);

    const existingEducator = await this.invitesService.findEducatorByEmail(dto.email);

    // Same-role check: only an already-active Educator blocks a new invite.
    // An existing admin (User row) is intentionally allowed — cross-role
    // accounts sharing the same email are a supported dual-role scenario.
    if (existingEducator?.is_active) {
      throw new BadRequestException(InvitesConstants.MESSAGES.USER_EXISTS);
    }

    if (!existingEducator) {
      const existingInvite = await this.invitesService.findPendingInviteByEmail(dto.email);
      if (existingInvite) throw new BadRequestException(InvitesConstants.MESSAGES.INVITE_EXISTS);
    }

    const educatorRole = await this.invitesService.findRoleByName('Educator');

    return this.invitesService.createInvite(dto, creator, school, educatorRole, existingEducator);
  }

  @Post(InvitesConstants.ROUTES.VERIFY)
  @ApiOperation({ summary: InvitesConstants.SWAGGER.SUMMARY_VERIFY })
  async verifyInvite(@Body() dto: VerifyInviteDto): Promise<ServiceResponse<Invite>> {
    const invite = await this.invitesService.findInviteById(dto.invite_id);
    if (!invite) throw new BadRequestException(InvitesConstants.MESSAGES.INVALID_OR_EXPIRED);

    if (invite.status === InviteStatus.ACCEPTED)
      throw new BadRequestException(InvitesConstants.MESSAGES.INVITE_ALREADY_USED);

    if (invite.status === InviteStatus.EXPIRED)
      throw new BadRequestException(InvitesConstants.MESSAGES.INVITE_EXPIRED);
    if (!invite.expires_at || new Date() > new Date(invite.expires_at))
      throw new BadRequestException(InvitesConstants.MESSAGES.INVITE_EXPIRED);

    return this.invitesService.verifyInvite(invite);
  }

  @Get(InvitesConstants.ROUTES.GET_DETAILS)
  @ApiOperation({ summary: 'Get email and full_name by invite ID' })
  async getInviteDetails(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ServiceResponse<InviteDetails>> {
    const invite = await this.invitesService.findInviteById(id);
    if (!invite) throw new BadRequestException(InvitesConstants.MESSAGES.INVALID_OR_EXPIRED);

    if (invite.status !== InviteStatus.PENDING) {
      throw new BadRequestException(InvitesConstants.MESSAGES.INVITE_ALREADY_USED);
    }

    if (!invite.expires_at || new Date() > new Date(invite.expires_at)) {
      throw new BadRequestException(InvitesConstants.MESSAGES.INVITE_EXPIRED);
    }

    return this.invitesService.getInviteDetails(invite);
  }
}
