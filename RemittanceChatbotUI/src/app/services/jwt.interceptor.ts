// In src/app/services/jwt.interceptor.ts
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export const jwtInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
    const authService = inject(AuthService);

    // Add auth header with jwt if user is logged in and request is to the api url
    const token = authService.authToken;
    const isApiUrl = req.url.startsWith(environment.apiUrl);

    console.log('JWT Interceptor - Request URL:', req.url);
    console.log('JWT Interceptor - Is API URL:', isApiUrl);
    console.log('JWT Interceptor - Token exists:', !!token);

    if (token && isApiUrl) {
        console.log('JWT Interceptor - Adding Authorization header');
        // FIXED: Ensure proper Bearer format with a space after "Bearer"
        req = req.clone({
            setHeaders: {
                Authorization: `Bearer ${token}`
            }
        });
    } else {
        console.log('JWT Interceptor - Not adding Authorization header');
    }

    return next(req);
};