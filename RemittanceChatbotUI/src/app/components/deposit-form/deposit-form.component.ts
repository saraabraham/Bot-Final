// Enhanced deposit-form.component.ts

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

                // If payment method is card, ensure card details validators are applied
                if (params['method'] === 'card') {
                    this.applyCardValidators();
                }
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
            expiryDate: ['', [Validators.required, Validators.pattern('^(0[1-9]|1[0-2])/[0-9]{2}$')]],
            cvv: ['', [Validators.required, Validators.pattern('^[0-9]{3,4}$')]],
            cardHolderName: ['', Validators.required]
        });

        // Show/hide card fields based on payment method
        this.depositForm.get('paymentMethod')?.valueChanges.subscribe(method => {
            if (method === 'card') {
                this.applyCardValidators();
            } else {
                this.clearCardValidators();
            }
        });
    }

    // Helper method to apply card validators
    private applyCardValidators(): void {
        const cardFields = ['cardNumber', 'expiryDate', 'cvv', 'cardHolderName'];

        cardFields.forEach(field => {
            this.depositForm.get(field)?.setValidators([Validators.required]);
            this.depositForm.get(field)?.updateValueAndValidity();
        });
    }

    // Helper method to clear card validators
    private clearCardValidators(): void {
        const cardFields = ['cardNumber', 'expiryDate', 'cvv', 'cardHolderName'];

        cardFields.forEach(field => {
            this.depositForm.get(field)?.clearValidators();
            this.depositForm.get(field)?.updateValueAndValidity();
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

        // Create a deposit request object based on payment method
        const paymentMethod = this.depositForm.get('paymentMethod')?.value;
        let depositRequest: DepositRequest;

        // Common fields for all payment methods
        const baseRequest = {
            amount: this.depositForm.get('amount')?.value,
            currency: this.depositForm.get('currency')?.value,
            paymentMethod: paymentMethod
        };

        // Add card details only if payment method is 'card'
        if (paymentMethod === 'card') {
            depositRequest = {
                ...baseRequest,
                cardDetails: {
                    cardNumber: this.depositForm.get('cardNumber')?.value,
                    expiryDate: this.depositForm.get('expiryDate')?.value,
                    cvv: this.depositForm.get('cvv')?.value,
                    cardHolderName: this.depositForm.get('cardHolderName')?.value
                }
            };
        } else {
            // For bank or wallet payments, don't include card details
            depositRequest = baseRequest;
        }

        // Debug log to see exactly what we're sending
        console.log('Sending deposit request from form:', depositRequest);

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
                this.errorMessage = error.message || 'Failed to process your deposit. Please try again.';
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