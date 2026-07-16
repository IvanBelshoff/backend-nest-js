import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { UserRequest } from 'src/shared/interfaces/UserRequest';
import { AiAccessService } from './ai-access.service';

@Injectable()
export class AiAccessGuard implements CanActivate {
  constructor(private readonly aiAccessService: AiAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<UserRequest>();

    if (!request.user?.sub) {
      throw new UnauthorizedException();
    }

    await this.aiAccessService.assertCanUseAi(Number(request.user.sub));
    return true;
  }
}
