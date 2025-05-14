// In src/app/services/auth.service.ts
import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { User, LoginRequest, LoginResponse } from '../models/user.model';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private currentUserSubject: BehaviorSubject<User | null>;
    public currentUser$: Observable<User | null>;
    private tokenKey = 'auth_token';
    private rememberMeKey = 'remember_email';
    private isBrowser: boolean;

    constructor(
        private http: HttpClient,
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        // Check if we're in a browser environment
        this.isBrowser = isPlatformBrowser(this.platformId);

        // Initialize from localStorage if available and in browser environment
        let userData: User | null = null;

        try {
            if (this.isBrowser) {
                const storedToken = localStorage.getItem(this.tokenKey);
                if (storedToken) {
                    // Parse the token to get user data or set a default authenticated user
                    userData = {
                        id: 'user1', // This should ideally come from the token payload
                        name: 'John Doe',
                        email: 'john@example.com',
                        isAuthenticated: true
                    };
                    console.log('Auth service initialized with stored token, user:', userData);
                } else {
                    console.log('No stored token found');
                }
            }
        } catch (error) {
            console.error('Error initializing auth service from storage:', error);
        }

        this.currentUserSubject = new BehaviorSubject<User | null>(userData);
        this.currentUser$ = this.currentUserSubject.asObservable();

        // Log the current authentication state on initialization
        console.log('Auth service initialized, authenticated:', this.isAuthenticated);
    }

    public get currentUser(): User | null {
        return this.currentUserSubject.value;
    }

    public get isAuthenticated(): boolean {
        return !!this.currentUserSubject.value?.isAuthenticated;
    }

    public get authToken(): string | null {
        if (!this.isBrowser) {
            return null;
        }
        return localStorage.getItem(this.tokenKey);
    }

    login(email: string, password: string, rememberMe: boolean = false): Observable<LoginResponse> {
        console.log(`Attempting login for ${email}, remember me: ${rememberMe}`);

        const loginRequest: LoginRequest = { email, password };

        return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, loginRequest)
            .pipe(
                tap(response => {
                    console.log('Login response received:', response);

                    // Store token in localStorage if in browser
                    if (this.isBrowser) {
                        localStorage.setItem(this.tokenKey, response.token);

                        // Handle remember me
                        if (rememberMe) {
                            localStorage.setItem(this.rememberMeKey, email);
                        } else {
                            localStorage.removeItem(this.rememberMeKey);
                        }
                    }

                    // Update current user state
                    const user: User = {
                        id: response.id,
                        name: response.name,
                        email: response.email,
                        phone: response.phone,
                        preferredCurrency: response.preferredCurrency,
                        isAuthenticated: true
                    };

                    this.currentUserSubject.next(user);
                    console.log('User authenticated:', user);
                }),
                catchError(error => {
                    console.error('Login error:', error);
                    throw error;
                })
            );
    }

    logout(): void {
        // Remove token from localStorage if in browser
        if (this.isBrowser) {
            localStorage.removeItem(this.tokenKey);
        }

        // Clear current user state
        this.currentUserSubject.next(null);

        console.log('User logged out');

        // Redirect to login page
        this.router.navigate(['/login']);
    }

    rememberCredentials(email: string, remember: boolean): void {
        if (!this.isBrowser) {
            return;
        }

        if (remember && email) {
            localStorage.setItem(this.rememberMeKey, email);
        } else {
            localStorage.removeItem(this.rememberMeKey);
        }
    }

    getRememberedCredentials(): string | null {
        if (!this.isBrowser) {
            return null;
        }
        return localStorage.getItem(this.rememberMeKey);
    }
    // Debug checks for auth.service.ts

    // Add these debugging methods to your auth.service.ts 
    // (Don't replace the existing methods, just add these new ones)

    // Add this to your AuthService class
    public checkAuthStatus(): { isAuthenticated: boolean, hasToken: boolean, tokenValue: string } {
        // Get token from localStorage
        const token = this.isBrowser ? localStorage.getItem(this.tokenKey) : null;

        // Check if token exists and is not empty
        const hasToken = !!token && token.length > 10; // Basic check that it's a reasonable token

        // Check if authenticated according to our currentUserSubject
        const isAuth = !!this.currentUserSubject.value?.isAuthenticated;

        // Return a debug object with auth status info
        return {
            isAuthenticated: isAuth,
            hasToken: hasToken,
            tokenValue: token ? `${token.substring(0, 10)}...` : 'null'
        };
    }

    // Add this to your AuthService class
    public refreshAuthStatus(): void {
        // This method should be called if you suspect the auth state is out of sync
        console.log('Refreshing auth status...');

        // Get current auth status
        const beforeStatus = this.checkAuthStatus();
        console.log('Before refresh:', beforeStatus);

        // Check localStorage for token
        if (this.isBrowser) {
            const token = localStorage.getItem(this.tokenKey);

            if (token && !this.currentUserSubject.value?.isAuthenticated) {
                console.log('Found token but not authenticated, updating status...');

                // Create a basic user object
                const user: User = {
                    id: 'user_from_token',
                    name: 'User',
                    email: 'user@example.com',
                    isAuthenticated: true
                };

                // Update current user subject
                this.currentUserSubject.next(user);
            } else if (!token && this.currentUserSubject.value?.isAuthenticated) {
                console.log('No token but marked as authenticated, fixing...');

                // Clear current user
                this.currentUserSubject.next(null);
            }
        }

        // Get updated auth status
        const afterStatus = this.checkAuthStatus();
        console.log('After refresh:', afterStatus);
    }
}