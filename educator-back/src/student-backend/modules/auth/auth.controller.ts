import { Controller, Get, Post, Body, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { type Request } from 'express';

import { JwtAuthGuard } from '../../guards/jwt-auth.guard';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

interface AuthenticatedUser {
  id?: string;
  userId?: string;
  email?: string;
  name?: string;
  role?: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@ApiTags('Student-backend: Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.userId ?? request.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.authService.getMe(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: 'User logout' })
  async logout(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.userId ?? request.user?.id;

    if (!userId) {
      throw new UnauthorizedException();
    }

    await this.authService.logout(userId);
    return { message: 'Logout successful' };
  }
}
