import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { RemittanceService, DepositRequest } from '../../services/remittance.service';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-deposit-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterModule
    ],
    templateUrl: './deposit-form.component.html',
    styleUrls: ['./deposit-form.component.scss']
})
export class DepositFormComponent implements OnInit {
    depositForm!: FormGroup;
    loading = false;
    submitting = false;
    currencies = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY'];
    paymentMethods = ['card', 'bank', 'wallet'];
    errorMessage = '';
    successMessage = '';
    userBalance = 0;
    userCurrency = 'USD';
    currentUserId = '';

    constructor(
        private fb: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private remittanceService: RemittanceService,
        public authService: AuthService // Changed to public for template access
    ) { }

    ngOnInit(): void {
        // Check authentication
        if (!this.authService.isAuthenticated) {
            this.router.navigate(['/login'], {
                queryParams: { returnUrl: this.router.url }
            });
            return;
        }

        // Set current user ID for reference
        this.currentUserId = this.authService.currentUser?.id || '';

        this.initForm();
        this.loadUserBalance();

        // Get query params if coming from chat
        this.route.queryParams.subscribe(params => {
            if (params['amount']) {
                this.depositForm.get('amount')?.setValue(parseFloat(params['amount']));
            }
            if (params['currency']) {
                this.depositForm.get('currency')?.setValue(params['currency']);
            }
            if (params['method']) {
                this.depositForm.get('paymentMethod')?.setValue(params['method']);
            }
        });
    }

    private loadUserBalance(): void {
        this.remittanceService.getUserBalance().subscribe({
            next: (balance) => {
                this.userBalance = balance.balance;
                this.userCurrency = balance.currency;
            },
            error: (error) => {
                console.error('Error loading user balance:', error);
                this.errorMessage = 'Unable to load your account balance. Some features may be limited.';
            }
        });
    }

    private initForm(): void {
        this.depositForm = this.fb.group({
            amount: [null, [Validators.required, Validators.min(0.01)]],
            currency: ['USD', Validators.required],
            paymentMethod: ['card', Validators.required],
            cardNumber: ['', [Validators.required, Validators.pattern('^[0-9]{16}$')]],
            expiryDate: ['', [Validators.required, Validators.pattern('^(0[1-9]|1[0-2])\/[0-9]{2}$')]],
            cvv: ['', [Validators.required, Validators.pattern('^[0-9]{3,4}$')]],
            cardHolderName: ['', Validators.required]
        });

        // Show/hide card fields based on payment method
        this.depositForm.get('paymentMethod')?.valueChanges.subscribe(method => {
            const cardFields = ['cardNumber', 'expiryDate', 'cvv', 'cardHolderName'];

            if (method === 'card') {
                cardFields.forEach(field => {
                    this.depositForm.get(field)?.setValidators([Validators.required]);
                    this.depositForm.get(field)?.updateValueAndValidity();
                });
            } else {
                cardFields.forEach(field => {
                    this.depositForm.get(field)?.clearValidators();
                    this.depositForm.get(field)?.updateValueAndValidity();
                });
            }
        });
    }

    onSubmit(): void {
        if (this.depositForm.invalid) {
            // Mark all fields as touched to show validation errors
            Object.keys(this.depositForm.controls).forEach(key => {
                this.depositForm.get(key)?.markAsTouched();
            });
            return;
        }

        this.submitting = true;
        this.errorMessage = '';

        // Create a deposit request object that matches the backend expected type
        const depositRequest: DepositRequest = {
            amount: this.depositForm.get('amount')?.value,
            currency: this.depositForm.get('currency')?.value,
            paymentMethod: this.depositForm.get('paymentMethod')?.value,
            cardDetails: this.depositForm.get('paymentMethod')?.value === 'card' ? {
                cardNumber: this.depositForm.get('cardNumber')?.value,
                expiryDate: this.depositForm.get('expiryDate')?.value,
                cvv: this.depositForm.get('cvv')?.value,
                cardHolderName: this.depositForm.get('cardHolderName')?.value
            } : undefined
        };

        this.remittanceService.depositMoney(depositRequest).subscribe({
            next: (result) => {
                this.submitting = false;
                this.successMessage = `Successfully deposited ${depositRequest.amount} ${depositRequest.currency} to your account!`;

                // Update user balance
                this.loadUserBalance();

                // Reset form
                this.depositForm.reset({
                    currency: 'USD',
                    paymentMethod: 'card'
                });

                // Navigate to chat after a short delay, preserving component state
                setTimeout(() => {
                    this.router.navigate(['/chat'], {
                        queryParams: {
                            depositSuccess: true,
                            amount: depositRequest.amount,
                            currency: depositRequest.currency,
                            // Add timestamp to make query params unique each time
                            _t: new Date().getTime()
                        },
                        // This option prevents query parameters from being reused 
                        // when navigating to the same route
                        queryParamsHandling: 'merge'
                    });
                }, 2000);
            },
            error: (error) => {
                console.error('Deposit error:', error);
                this.errorMessage = error.error?.message || 'Failed to process your deposit. Please try again.';
                this.submitting = false;
            }
        });
    }


    // Also update the cancel method
    cancel(): void {
        // Navigate back to chat without any success parameters
        this.router.navigate(['/chat'], {
            // Add timestamp to avoid query param conflicts
            queryParams: { _t: new Date().getTime() }
        });
    }
}