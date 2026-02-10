import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { TokenService } from '../services/utils/token.service';

export const AuthGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const tokenService = inject(TokenService);
  const router = inject(Router);
  const authToken = tokenService.getToken();
  if (authToken) {
    return true;
  } else {
    tokenService.clearToken();
    router.navigateByUrl('/auth');
    return false;
  }
};
