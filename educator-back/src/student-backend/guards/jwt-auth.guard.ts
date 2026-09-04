import { AuthGuard } from '@nestjs/passport';
import { STUDENT_BACKEND_JWT_STRATEGY } from './jwt.strategy';

export class JwtAuthGuard extends AuthGuard(STUDENT_BACKEND_JWT_STRATEGY) {}
