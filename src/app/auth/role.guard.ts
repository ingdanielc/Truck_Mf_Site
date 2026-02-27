import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { filter, timeout, catchError } from 'rxjs/operators';
import { TokenService } from '../services/utils/token.service';
import { SecurityService } from '../services/security/security.service';

/**
 * Resolves the user role. If the user data is already cached in the
 * SecurityService (common case after login), it returns immediately.
 * Otherwise, it waits up to 3 s for the BehaviorSubject to emit a user,
 * and ultimately falls back to the JWT payload so the app never hangs.
 */
async function resolveRole(
  securityService: SecurityService,
  tokenService: TokenService,
): Promise<string> {
  // Fast path – data already available
  const cached = securityService.getUserData();
  if (cached) {
    return (cached.userRoles?.[0]?.role?.name ?? '').toUpperCase();
  }

  // Kick off the API call if not already running
  try {
    const payload = tokenService.getPayload();
    const userId = payload?.nameid ?? payload?.id ?? payload?.sub;
    if (userId) {
      securityService.fetchUserData(userId);
    }
  } catch {
    /* ignore parse errors */
  }

  // Wait for the observable to emit a real user (with a 3 s safety timeout)
  try {
    const user = await firstValueFrom(
      securityService.userData$.pipe(
        filter((u) => u !== null),
        timeout(3000),
        catchError(() => of(null)),
      ),
    );
    if (user) {
      return (user.userRoles?.[0]?.role?.name ?? '').toUpperCase();
    }
  } catch {
    /* timeout or error – fall through to JWT fallback */
  }

  // Last resort: parse the JWT payload directly
  try {
    const payload = tokenService.getPayload();
    const roles: string | string[] = payload?.role ?? payload?.roles ?? '';
    const roleStr = Array.isArray(roles) ? roles[0] : roles;
    return roleStr.toUpperCase();
  } catch {
    return '';
  }
}

/**
 * Route guard that checks whether the current user's role is
 * included in the `allowedRoles` array declared in the route's `data`.
 *
 * Usage in views.routes.ts:
 *   {
 *     path: 'owners',
 *     canActivate: [RoleGuard],
 *     data: { allowedRoles: ['ADMINISTRADOR'] },
 *     ...
 *   }
 */
export const RoleGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  _state: RouterStateSnapshot,
) => {
  const tokenService = inject(TokenService);
  const securityService = inject(SecurityService);
  const router = inject(Router);

  const allowedRoles: string[] = route.data?.['allowedRoles'] ?? [];
  const userRole = await resolveRole(securityService, tokenService);

  const hasAccess =
    allowedRoles.length === 0 || allowedRoles.some((r) => userRole.includes(r));

  if (hasAccess) {
    return true;
  }

  router.navigate(['/site/home']);
  return false;
};
