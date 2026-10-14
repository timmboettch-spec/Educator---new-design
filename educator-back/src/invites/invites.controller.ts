import {
  Controller,
  Post,
  Body,
  Req,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';

import { ApiTags, ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ResponseResult } from 'src/common/class/response.class';
import { EmptyDataDto } from 'src/common/dtos/api-response.dto';
import { InvitesService } from './invites.service';
import { InviteTokenService } from './invite-token.service';
import { CreateInviteDto, InviteCreateResponse } from './dto/invites.dto';
import { AcceptInviteReqDto, AcceptInviteResponseDto } from './dto/accept-invite.dto';
import { VerifyInviteTokenReqDto } from './dto/verify-invite-token.dto';
import type { JwtRequest } from '../common/types';
import { InvitesConstants } from './invites.constants';
import { ROLE_REPOSITORY } from 'src/database/tokens';
import { RoleRepository } from 'src/database/repositories';
import { RoleSlug } from 'src/common/constants';
import { Public } from 'src/common/decorators/public.decorator';
import { RequiredRoles } from 'src/common/decorators/required-roles.decorator';

@ApiTags(InvitesConstants.SWAGGER.TAG)
@Controller(InvitesConstants.ROUTES.BASE)
export class InvitesController {
  constructor(
    private readonly invitesService: InvitesService,
    private readonly inviteTokenService: InviteTokenService,
    @Inject(ROLE_REPOSITORY)
    private readonly roleRepository: RoleRepository) { }

  @Post(InvitesConstants.ROUTES.CREATE)
  @RequiredRoles(RoleSlug.DISTRICT_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: InvitesConstants.SWAGGER.SUMMARY_CREATE })
  async createInvite(
    @Body() dto: CreateInviteDto,
    @Req() req: JwtRequest,
  ): Promise<ResponseResult<InviteCreateResponse>> {
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

    const educatorRole = await this.roleRepository.findBySlug(RoleSlug.EDUCATOR);
    if (!educatorRole) {
      throw new BadRequestException(InvitesConstants.MESSAGES.ROLE_NOT_FOUND);
    }

    return this.invitesService.createInvite(dto, creator, school, educatorRole, existingEducator);
  }

  @Public()
  @Post(InvitesConstants.ROUTES.VERIFY_TOKEN)
  @ApiOperation({ summary: InvitesConstants.SWAGGER.SUMMARY_VERIFY_TOKEN })
  async verifyInviteToken(
    @Body() dto: VerifyInviteTokenReqDto,
  ) {
    const invite = await this.inviteTokenService.resolve(dto.token);
    return this.invitesService.getInviteDetails(invite);
  }

  @Public()
  @Post(InvitesConstants.ROUTES.ACCEPT_INVITE)
  @ApiOkResponse({ type: AcceptInviteResponseDto })
  async acceptInvite(@Body() dto: AcceptInviteReqDto): Promise<ResponseResult<EmptyDataDto>> {
    return this.invitesService.acceptInvite(dto);
  }
}
