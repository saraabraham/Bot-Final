// Update the jwt.interceptor.ts to add more debugging

// This should be in jwt.interceptor.ts
// Add logging to debug auth token issues

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

    // Log headers before any modifications
    console.log('Original request headers:',
        req.headers.keys().map(k => `${k}: ${req.headers.get(k)}`).join(', '));

    if (token && isApiUrl) {
        console.log('JWT Interceptor - Adding Authorization header');
        // FIXED: Ensure proper Bearer format with a space after "Bearer"
        req = req.clone({
            setHeaders: {
                Authorization: `Bearer ${token}`
            }
        });

        // Log updated headers for debugging
        console.log('Updated request headers:',
            req.headers.keys().map(k => `${k}: ${req.headers.get(k)}`).join(', '));
    } else {
        console.log('JWT Interceptor - Not adding Authorization header');
        if (!token) {
            console.warn('JWT Interceptor - Token is missing');
        }
        if (!isApiUrl) {
            console.log('JWT Interceptor - Not an API URL, no auth header needed');
        }
    }

    return next(req);
};