// src/app/services/auth.guard.ts
import { Injectable } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class AuthGuard {
    constructor(
        private router: Router,
        private authService: AuthService
    ) { }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
        console.log('AuthGuard.canActivate() - Checking authentication state:', this.authService.isAuthenticated);
        console.log('Current user subject value:', this.authService.currentUser);

        if (this.authService.isAuthenticated) {
            // Logged in, so return true
            console.log('AuthGuard: User is authenticated, allowing navigation');
            return true;
        }

        // Not logged in, so redirect to login page with return url
        console.log('AuthGuard: User is not authenticated, redirecting to login');
        this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return false;
    }
}