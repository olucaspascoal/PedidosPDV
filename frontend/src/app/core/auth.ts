import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { User } from './models';
import { storage } from './storage';

const KEY = 'pdv.session';
interface Session { token: string; user: User; }

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private session = signal<Session | null>(storage.get<Session>(KEY));

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isAdmin = computed(() => this.user()?.role === 'Admin');

  setSession(token: string, user: User) {
    this.session.set({ token, user });
    storage.set(KEY, { token, user });
  }

  logout() {
    this.session.set(null);
    storage.remove(KEY);
    this.router.navigateByUrl('/entrar');
  }

  /** Celular abre no PDV; computador de admin abre na gestão. */
  homeUrl() {
    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    return this.isAdmin() && desktop ? '/gestao' : '/pdv';
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && token) auth.logout();
      return throwError(() => err);
    }),
  );
};

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? true : inject(Router).parseUrl('/entrar');
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.user()) return inject(Router).parseUrl('/entrar');
  return auth.isAdmin() ? true : inject(Router).parseUrl('/pdv');
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? inject(Router).parseUrl(auth.homeUrl()) : true;
};
