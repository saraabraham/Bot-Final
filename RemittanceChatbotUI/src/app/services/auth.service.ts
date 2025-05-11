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

        // Check for existing token on startup (only in browser)
        if (this.isBrowser) {
            const storedUser = localStorage.getItem('currentUser');
            if (storedUser) {
                this.currentUserSubject.next(JSON.parse(storedUser));
            }
        }
    }

    login(email: string, password: string): Observable<LoginResponse> {
        return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { email, password })
            .pipe(
                tap(response => {
                    const user: User = {
                        id: response.id,
                        name: response.name,
                        email: response.email,
                        phone: response.phone,
                        preferredCurrency: response.preferredCurrency,
                        isAuthenticated: response.isAuthenticated
                    };

                    if (this.isBrowser) {
                        localStorage.setItem('currentUser', JSON.stringify(user));
                        localStorage.setItem('token', response.token);
                    }
                    this.currentUserSubject.next(user);
                })
            );
    }

    logout(): void {
        if (this.isBrowser) {
            localStorage.removeItem('currentUser');
            localStorage.removeItem('token');
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
            return localStorage.getItem('token');
        }
        return null;
    }
}