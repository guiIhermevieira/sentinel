import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../database/entities/api-key.entity';
import { ApiKeysService } from './api-keys.service';
import { PUBLIC_KEY, requestOf, ROLES_KEY } from './decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeys: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = requestOf(context);
    const [scheme, key] = (request.headers.authorization ?? '').split(' ');
    const principal = scheme === 'Bearer' && key ? await this.apiKeys.verify(key) : null;
    if (!principal) throw new UnauthorizedException('A valid API key is required');
    request.principal = principal;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (!roles) throw new ForbiddenException('No roles are allowed on this operation');
    if (principal.role !== 'admin' && !roles.includes(principal.role)) {
      throw new ForbiddenException(`Role "${principal.role}" cannot perform this operation`);
    }
    return true;
  }
}
