import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@message-hub/domain';
import { ROLES_KEY } from './roles.decorator';
import { AuthenticatedUser } from './current-user.decorator';

/**
 * Only restricts a route when it's annotated with @Roles(...) — routes
 * without that metadata just require authentication (enforced by
 * JwtAuthGuard, which always runs first), which is exactly what lets
 * 'viewer' read everything without extra per-GET annotations.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user || !requiredRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException(`Requires one of roles: ${requiredRoles.join(', ')}`);
    }
    return true;
  }
}
