import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterModule
    ],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
    loginForm: FormGroup;
    loading = false;
    error = '';
    returnUrl = '/chat';

    constructor(
        private fb: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private authService: AuthService
    ) {
        this.loginForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', Validators.required],
            rememberMe: [false]
        });
    }
    ngOnInit(): void {
        this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/chat';
        console.log('Login component initialized, current auth state:', this.authService.isAuthenticated);
        console.log('Return URL is:', this.returnUrl);

        // Check if we have remembered credentials - safely
        try {
            const rememberedEmail = this.authService.getRememberedCredentials();
            console.log('Remembered email type:', typeof rememberedEmail);

            if (rememberedEmail && typeof rememberedEmail === 'string') {
                console.log('Found remembered email:', rememberedEmail);
                this.loginForm.patchValue({
                    email: rememberedEmail,
                    rememberMe: true
                });
            } else if (rememberedEmail) {
                console.warn('Found remembered email but it has wrong type:', rememberedEmail);
                // Clear invalid data
                this.authService.rememberCredentials('', false);
            }
        } catch (error) {
            console.error('Error retrieving remembered credentials:', error);
            // Clear potentially corrupted data
            this.authService.rememberCredentials('', false);
        }

        // Only redirect if already logged in and NOT coming from a protected route
        if (this.authService.isAuthenticated && !this.route.snapshot.queryParams['returnUrl']) {
            console.log('Already authenticated, navigating to:', this.returnUrl);
            this.router.navigate([this.returnUrl]);
        }
    }

    onSubmit(): void {
        if (this.loading) {
            console.log('Submit clicked while already loading, ignoring');
            return;
        }
        if (this.loginForm.invalid) {
            // Mark all fields as touched to show validation errors
            Object.keys(this.loginForm.controls).forEach(key => {
                this.loginForm.get(key)?.markAsTouched();
            });
            return;
        }

        this.loading = true;
        this.error = '';
        const resetLoading = () => {
            console.log('Resetting loading state');
            this.loading = false;
        };

        // Set a timeout to auto-reset loading state after 10 seconds
        const loadingTimeout = setTimeout(() => {
            if (this.loading) {
                console.log('Loading timeout triggered');
                this.error = 'Request is taking too long. Please try again.';
                resetLoading();
            }
        }, 10000);

        const email = this.loginForm.get('email')?.value;
        const password = this.loginForm.get('password')?.value;
        const rememberMe = this.loginForm.get('rememberMe')?.value;

        console.log('Attempting login for:', email);

        this.authService.login(email, password, rememberMe)
            .subscribe({
                next: (response) => {
                    console.log('Login successful, attempting navigation to:', this.returnUrl);

                    // Store "Remember Me" credentials if checked
                    if (rememberMe) {
                        this.authService.rememberCredentials(email, true);
                    } else {
                        this.authService.rememberCredentials('', false);
                    }
                    this.forceAuthRefresh(response);

                    // Add a small delay to ensure auth state is updated before navigation
                    setTimeout(() => {
                        console.log('Current auth state before navigation:', this.authService.isAuthenticated);
                        this.router.navigate([this.returnUrl])
                            .then(success => {
                                console.log('Navigation result:', success ? 'successful' : 'failed');
                                if (!success) {
                                    console.error('Navigation failed to:', this.returnUrl);
                                    // Try navigating to the home page as fallback
                                    this.router.navigate(['/chat']);
                                }
                                this.loading = false;
                            })
                            .catch(err => {
                                console.error('Navigation error:', err);
                                this.error = 'Error navigating after login. Please try again.';
                                this.loading = false;
                            });
                    }, 100);
                },
                error: (error) => {
                    clearTimeout(loadingTimeout); // Clear the timeout
                    console.error('Login error:', error);
                    this.error = error.error?.message || 'Login failed. Please check your credentials.';
                    this.loading = false;
                }
            });
    }
    private forceAuthRefresh(user: any): void {
        // Force update the auth state
        this.authService['currentUserSubject'].next(user);

        // Double-check authentication state
        console.log('After forced refresh, auth state:', this.authService.isAuthenticated);
    }


}