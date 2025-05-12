// src/app/services/auth.service.ts
import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { User, LoginResponse } from '../models/user.model';
import { environment } from '../../environments/environment';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private currentUserSubject = new BehaviorSubject<User | null>(null);
    public currentUser$ = this.currentUserSubject.asObservable();

    private apiUrl = `${environment.apiUrl}/auth`;
    private isBrowser: boolean;

    constructor(
        private http: HttpClient,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        this.isBrowser = isPlatformBrowser(this.platformId);
        if (this.isBrowser) {
            console.log('Auth service initializing in browser environment');

            // Check both storage types
            const storedUserLocal = localStorage.getItem('currentUser');
            const storedUserSession = sessionStorage.getItem('currentUser');

            console.log('Found stored user?',
                'localStorage:', !!storedUserLocal,
                'sessionStorage:', !!storedUserSession);

            const storedUser = storedUserSession || storedUserLocal;
            if (storedUser) {
                try {
                    const user = JSON.parse(storedUser);
                    console.log('Loaded stored user:', user);
                    this.currentUserSubject.next(user);
                } catch (e) {
                    console.error('Error parsing stored user:', e);
                }
            }
        }
    }

    // In auth.service.ts
    // src/app/services/auth.service.ts
    login(email: string, password: string, rememberMe: boolean = false): Observable<LoginResponse> {
        console.log(`Sending login request to ${this.apiUrl}/login`, { email, rememberMe });

        return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { email, password })
            .pipe(
                tap({
                    next: (response) => {
                        console.log('Received login response:', response);

                        const user: User = {
                            id: response.id,
                            name: response.name,
                            email: response.email,
                            phone: response.phone,
                            preferredCurrency: response.preferredCurrency,
                            isAuthenticated: response.isAuthenticated
                        };

                        console.log('Created user object:', user);

                        if (this.isBrowser) {
                            // Use localStorage for "remember me", sessionStorage otherwise
                            const storage = rememberMe ? localStorage : sessionStorage;
                            storage.setItem('currentUser', JSON.stringify(user));
                            storage.setItem('token', response.token);
                            console.log('Stored user data in', rememberMe ? 'localStorage' : 'sessionStorage');
                            if (rememberMe) {
                                this.rememberCredentials(email, true);
                            }
                        }

                        this.currentUserSubject.next(user);
                        console.log('Updated currentUserSubject');
                    },
                    error: (error) => {
                        console.error('Login request error:', error);
                    }
                })
            );
    }
    logout(): void {
        if (this.isBrowser) {
            // Keep the remembered credentials (email and rememberMe)
            // but remove the authentication data

            // First, check if we should remember the credentials for next login
            const rememberMe = localStorage.getItem('rememberMe') === 'true';
            const rememberedEmail = localStorage.getItem('rememberedEmail');

            // Clear authentication data
            localStorage.removeItem('currentUser');
            localStorage.removeItem('token');
            sessionStorage.removeItem('currentUser');
            sessionStorage.removeItem('token');

            console.log('Auth data cleared, remember me status preserved:', { rememberMe, rememberedEmail });
        }
        this.currentUserSubject.next(null);
    }

    get isAuthenticated(): boolean {
        return !!this.currentUserSubject.value?.isAuthenticated;
    }

    get currentUser(): User | null {
        return this.currentUserSubject.value;
    }

    get authToken(): string | null {
        if (this.isBrowser) {
            return sessionStorage.getItem('token') || localStorage.getItem('token');
        }
        return null;
    }
    rememberCredentials(email: string, rememberMe: boolean): void {
        if (this.isBrowser) {
            if (rememberMe && email) {
                const emailString = String(email);
                localStorage.setItem('rememberedEmail', emailString);
                localStorage.setItem('rememberMe', 'true');
                console.log('Credentials remembered:', { email, rememberMe });
            }
            else {
                localStorage.removeItem('rememberedEmail');
                localStorage.removeItem('rememberMe');
                console.log('Credentials cleared:', { email, rememberMe });
            }
        }
    }

    getRememberedCredentials(): string | null {
        if (this.isBrowser) {
            try {
                const storedEmail = localStorage.getItem('rememberedEmail');
                console.log('Retrieved remembered email:', storedEmail);
                return storedEmail;


            } catch (e) {
                console.error('Error getting remembered email:', e);
                return null;
            }
        }
        return null;
    }
    isRememberMeChecked(): boolean {
        if (this.isBrowser) {
            const isChecked = localStorage.getItem('rememberMe') === 'true';
            console.log('Remember me is checked:', isChecked);
            return isChecked;
        }
        return false;
    }
}

