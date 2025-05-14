// Fix for remittance-form.component.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { RemittanceService } from '../../services/remittance.service';
import { AuthService } from '../../services/auth.service';
import { Recipient, RemittanceTransaction } from '../../models/remittance.model';
import { forkJoin, lastValueFrom } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
    selector: 'app-remittance-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterModule
    ],
    templateUrl: './remittance-form.component.html',
    styleUrls: ['./remittance-form.component.scss']
})
export class RemittanceFormComponent implements OnInit {
    remittanceForm!: FormGroup;
    recipients: Recipient[] = [];
    loading = false;
    submitting = false;
    showAddRecipient = false;
    currencies = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY'];
    paymentMethods = ['bank', 'card', 'wallet'];
    exchangeRate = 1;
    fees = 0;
    totalAmount = 0;
    errorMessage = '';
    successMessage = '';
    userBalance = 0;
    userCurrency = 'USD';
    showBalanceWarning = false;
    preselectedRecipientId = '';

    constructor(
        private fb: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private remittanceService: RemittanceService,
        private authService: AuthService
    ) { }

    ngOnInit(): void {
        // First check authentication - this is critical
        console.log('RemittanceForm component initialized, checking auth status');
        console.log('Auth token exists:', !!this.authService.authToken);
        console.log('Is authenticated according to service:', this.authService.isAuthenticated);

        // Check if user is logged in
        if (!this.authService.isAuthenticated) {
            this.router.navigate(['/login'], {
                queryParams: { returnUrl: this.router.url }
            });
            return;
        }

        // If we get here, user is authenticated
        console.log('User is authenticated, continuing with initialization');

        this.initForm();
        this.loadRecipients();
        this.loadUserBalance();

        // Get query params if coming from chat
        this.route.queryParams.subscribe(params => {
            if (params['amount']) {
                this.remittanceForm.get('amount')?.setValue(parseFloat(params['amount']));
            }
            if (params['currency']) {
                this.remittanceForm.get('currency')?.setValue(params['currency']);
            }
            if (params['recipient']) {
                // Will need to match by name once recipients are loaded
                const recipientName = params['recipient'];
                this.remittanceForm.get('recipientName')?.setValue(recipientName);
            }
            if (params['recipientId']) {
                // Store the preselected recipient ID
                this.preselectedRecipientId = params['recipientId'];
                // Will be set after recipients are loaded
            }

            // Handle new recipient flag
            if (params['newRecipient'] === 'true') {
                // Show add recipient form immediately
                this.showAddRecipient = true;

                // We'll toggle validation after the component initializes
                setTimeout(() => {
                    // Don't call toggle directly to avoid toggling the UI state
                    // Just apply the validations
                    if (this.showAddRecipient) {
                        // Remove validation from recipient dropdown
                        this.remittanceForm.get('recipient')?.clearValidators();
                        this.remittanceForm.get('recipient')?.setValue('');
                        this.remittanceForm.get('recipient')?.updateValueAndValidity();

                        // Add validation to new recipient fields
                        const newRecipientGroup = this.remittanceForm.get('newRecipient') as FormGroup;
                        newRecipientGroup.get('name')?.setValidators(Validators.required);
                        newRecipientGroup.get('accountNumber')?.setValidators(Validators.required);
                        newRecipientGroup.get('bankName')?.setValidators(Validators.required);
                        newRecipientGroup.get('country')?.setValidators(Validators.required);

                        // Pre-fill the name if available
                        if (params['recipient']) {
                            newRecipientGroup.get('name')?.setValue(params['recipient']);
                        }

                        // Update validity
                        Object.keys(newRecipientGroup.controls).forEach(key => {
                            newRecipientGroup.get(key)?.updateValueAndValidity();
                        });
                    }
                }, 0);
            }

            // Handle complete recipient flag
            if (params['completeRecipient'] === 'true' && params['recipientId']) {
                // We'll need to load the recipient data and show in edit mode
                this.loadRecipientForEdit(params['recipientId']);
            }
        });

        // Subscribe to form changes to calculate fees and total
        this.remittanceForm.get('amount')?.valueChanges.subscribe(val => {
            this.updateCalculations();
        });

        this.remittanceForm.get('currency')?.valueChanges.subscribe(val => {
            this.updateCalculations();
        });

        this.remittanceForm.get('paymentMethod')?.valueChanges.subscribe(val => {
            this.updateCalculations();
        });
    }

    // Add method to load a recipient for editing
    private loadRecipientForEdit(recipientId: string): void {
        // Find the recipient in already loaded recipients list
        const recipient = this.recipients.find(r => r.id === recipientId);

        if (recipient) {
            // Show add recipient mode
            this.showAddRecipient = true;

            // Set up validations and fill the form
            setTimeout(() => {
                // Remove validation from recipient dropdown
                this.remittanceForm.get('recipient')?.clearValidators();
                this.remittanceForm.get('recipient')?.setValue('');
                this.remittanceForm.get('recipient')?.updateValueAndValidity();

                // Add validation to new recipient fields
                const newRecipientGroup = this.remittanceForm.get('newRecipient') as FormGroup;
                newRecipientGroup.get('name')?.setValidators(Validators.required);
                newRecipientGroup.get('accountNumber')?.setValidators(Validators.required);
                newRecipientGroup.get('bankName')?.setValidators(Validators.required);
                newRecipientGroup.get('country')?.setValidators(Validators.required);

                // Pre-fill all fields
                newRecipientGroup.patchValue({
                    name: recipient.name,
                    accountNumber: recipient.accountNumber || '',
                    bankName: recipient.bankName || '',
                    country: recipient.country || '',
                    email: recipient.email || '',
                    phoneNumber: recipient.phoneNumber || ''
                });

                // Update validity
                Object.keys(newRecipientGroup.controls).forEach(key => {
                    newRecipientGroup.get(key)?.updateValueAndValidity();
                });
            }, 0);
        } else {
            // If not found in loaded recipients, make a separate request
            this.remittanceService.getSavedRecipients().subscribe({
                next: (recipients) => {
                    const recipient = recipients.find(r => r.id === recipientId);
                    if (recipient) {
                        // Update the recipients list
                        this.recipients = recipients;

                        // Show add recipient mode
                        this.showAddRecipient = true;

                        // Set up validations and fill the form
                        const newRecipientGroup = this.remittanceForm.get('newRecipient') as FormGroup;

                        // Remove validation from recipient dropdown
                        this.remittanceForm.get('recipient')?.clearValidators();
                        this.remittanceForm.get('recipient')?.setValue('');
                        this.remittanceForm.get('recipient')?.updateValueAndValidity();

                        // Add validation to new recipient fields
                        newRecipientGroup.get('name')?.setValidators(Validators.required);
                        newRecipientGroup.get('accountNumber')?.setValidators(Validators.required);
                        newRecipientGroup.get('bankName')?.setValidators(Validators.required);
                        newRecipientGroup.get('country')?.setValidators(Validators.required);

                        // Pre-fill all fields
                        newRecipientGroup.patchValue({
                            name: recipient.name,
                            accountNumber: recipient.accountNumber || '',
                            bankName: recipient.bankName || '',
                            country: recipient.country || '',
                            email: recipient.email || '',
                            phoneNumber: recipient.phoneNumber || ''
                        });

                        // Update validity
                        Object.keys(newRecipientGroup.controls).forEach(key => {
                            newRecipientGroup.get(key)?.updateValueAndValidity();
                        });
                    } else {
                        // If still not found, handle the error
                        this.errorMessage = 'Could not find the recipient to edit. Please try again.';
                    }
                },
                error: (error) => {
                    console.error('Error loading recipient for edit:', error);
                    this.errorMessage = 'Error loading recipient details. Please try again.';
                }
            });
        }
    }

    private loadUserBalance(): void {
        this.remittanceService.getUserBalance().subscribe({
            next: (balance) => {
                this.userBalance = balance.balance;
                this.userCurrency = balance.currency;

                // After loading balance, update calculations to check for sufficient funds
                this.updateCalculations();
            },
            error: (error) => {
                console.error('Error loading user balance:', error);
                this.errorMessage = 'Unable to load your account balance. Some features may be limited.';
            }
        });
    }

    private loadRecipients(): void {
        this.loading = true;
        console.log('Loading recipients with auth token:', !!this.authService.authToken);

        // Log the actual token for debugging (remove in production)
        const token = this.authService.authToken;
        if (token) {
            console.log('Token first 20 chars:', token.substring(0, 20) + '...');

            // Try to decode and log user info from token
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                console.log('Token payload:', payload);
            } catch (e) {
                console.error('Could not decode token:', e);
            }
        }

        this.remittanceService.getSavedRecipients().subscribe({
            next: (data) => {
                console.log('Recipients loaded successfully:', data);
                this.recipients = data;
                this.loading = false;

                // Check if we need to select a recipient by name (from chat)
                const recipientName = this.remittanceForm.get('recipientName')?.value;
                if (recipientName) {
                    const foundRecipient = this.recipients.find(r =>
                        r.name.toLowerCase() === recipientName.toLowerCase());
                    if (foundRecipient) {
                        this.remittanceForm.get('recipient')?.setValue(foundRecipient.id);
                    } else {
                        // If recipient not found, show the add recipient form
                        this.showAddRecipient = true;
                        // Pre-fill the name
                        const newRecipientGroup = this.remittanceForm.get('newRecipient') as FormGroup;
                        newRecipientGroup.get('name')?.setValue(recipientName);
                        this.toggleAddRecipient(); // Enable validation
                    }
                }

                // Check if we have a preselected recipient ID
                if (this.preselectedRecipientId) {
                    this.remittanceForm.get('recipient')?.setValue(this.preselectedRecipientId);
                }
            },
            error: (error) => {
                console.error('Error loading recipients:', error);
                // Show error message to user
                this.errorMessage = 'Failed to load recipients. Please try again or check your connection.';
                this.loading = false;
            }
        });
    }

    private initForm(): void {
        // Create form without nested group first
        this.remittanceForm = this.fb.group({
            amount: [null, [Validators.required, Validators.min(0.01)]],
            currency: ['USD', Validators.required],
            recipient: ['', Validators.required],
            recipientName: [''],
            paymentMethod: ['bank', Validators.required]
        });

        // Create newRecipient group WITHOUT validators initially
        const newRecipientGroup = this.fb.group({
            name: [''],
            accountNumber: [''],
            bankName: [''],
            country: [''],
            email: ['', [Validators.email]],
            phoneNumber: ['']
        });

        // Add the group to the form
        this.remittanceForm.addControl('newRecipient', newRecipientGroup);
    }

    toggleAddRecipient(): void {
        this.showAddRecipient = !this.showAddRecipient;

        if (this.showAddRecipient) {
            // Remove validation from recipient dropdown
            this.remittanceForm.get('recipient')?.clearValidators();
            this.remittanceForm.get('recipient')?.setValue('');
            this.remittanceForm.get('recipient')?.updateValueAndValidity();

            // Add validation to new recipient fields
            const newRecipientGroup = this.remittanceForm.get('newRecipient') as FormGroup;
            newRecipientGroup.get('name')?.setValidators(Validators.required);
            newRecipientGroup.get('accountNumber')?.setValidators(Validators.required);
            newRecipientGroup.get('bankName')?.setValidators(Validators.required);
            newRecipientGroup.get('country')?.setValidators(Validators.required);

            // Update validity
            Object.keys(newRecipientGroup.controls).forEach(key => {
                newRecipientGroup.get(key)?.updateValueAndValidity();
            });
        } else {
            // Add validation back to recipient dropdown
            this.remittanceForm.get('recipient')?.setValidators(Validators.required);
            this.remittanceForm.get('recipient')?.updateValueAndValidity();

            // Clear validation from new recipient fields
            const newRecipientGroup = this.remittanceForm.get('newRecipient') as FormGroup;
            newRecipientGroup.get('name')?.clearValidators();
            newRecipientGroup.get('accountNumber')?.clearValidators();
            newRecipientGroup.get('bankName')?.clearValidators();
            newRecipientGroup.get('country')?.clearValidators();

            // Keep email validator
            newRecipientGroup.get('email')?.setValidators(Validators.email);

            // Reset values
            newRecipientGroup.reset();

            // Update validity
            Object.keys(newRecipientGroup.controls).forEach(key => {
                newRecipientGroup.get(key)?.updateValueAndValidity();
            });
        }
    }

    checkFormValidity(): void {
        console.log('Checking form validity:');
        console.log('Form valid:', this.remittanceForm.valid);
        console.log('Form touched:', this.remittanceForm.touched);
        console.log('Form dirty:', this.remittanceForm.dirty);
        console.log('Form errors:', this.remittanceForm.errors);

        // Check amount field specifically
        const amountControl = this.remittanceForm.get('amount');
        console.log('Amount value:', amountControl?.value);
        console.log('Amount valid:', amountControl?.valid);
        console.log('Amount errors:', amountControl?.errors);

        // Check form values
        console.log('Form values:', this.remittanceForm.value);
    }

    updateCalculations(): void {
        const amount = this.remittanceForm.get('amount')?.value || 0;
        const currency = this.remittanceForm.get('currency')?.value || 'USD';
        const method = this.remittanceForm.get('paymentMethod')?.value || 'bank';

        // Skip if amount is not valid
        if (amount === null || amount === undefined || amount <= 0) {
            this.fees = 0;
            this.totalAmount = 0;
            this.showBalanceWarning = false;
            return;
        }

        forkJoin({
            exchangeRate: this.remittanceService.getExchangeRate('USD', currency),
            fees: this.remittanceService.calculateFees(amount, currency, method)
        }).subscribe({
            next: (result) => {
                this.exchangeRate = result.exchangeRate.rate;
                this.fees = result.fees.fees;
                this.totalAmount = amount + this.fees;

                // Check if user has sufficient balance
                if (this.userBalance > 0) {
                    // Convert transaction total to user's currency if needed
                    let totalInUserCurrency = this.totalAmount;

                    if (currency !== this.userCurrency) {
                        // We need to convert the amount to user's currency
                        // For simplicity, using the exchange rate we already have
                        // In a real app, we would get the correct exchange rate between transaction currency and user currency
                        totalInUserCurrency = this.totalAmount * (this.userCurrency === 'USD' ? 1 / this.exchangeRate : this.exchangeRate);
                    }

                    // Show warning if insufficient balance
                    this.showBalanceWarning = totalInUserCurrency > this.userBalance;
                }
            },
            error: (error) => {
                console.error('Error calculating transaction details:', error);
            }
        });
    }

    async onSubmit(): Promise<void> {
        // First, verify that the user is still authenticated
        if (!this.authService.isAuthenticated || !this.authService.authToken) {
            console.log('User not authenticated when trying to submit, redirecting to login');
            this.errorMessage = 'Your session has expired. Please log in again.';
            this.router.navigate(['/login'], {
                queryParams: { returnUrl: this.router.url }
            });
            return;
        }

        // Add additional validation for amount field
        const amount = this.remittanceForm.get('amount')?.value;
        if (amount === null || amount === undefined || amount <= 0) {
            this.errorMessage = 'Please enter a valid amount greater than zero.';
            // Mark amount field as touched to show validation error
            this.remittanceForm.get('amount')?.markAsTouched();
            return;
        }

        // Check if user has sufficient balance
        if (this.showBalanceWarning) {
            this.errorMessage = `Insufficient balance. Your current balance is ${this.userBalance} ${this.userCurrency}.`;
            return;
        }

        this.submitting = true;
        this.errorMessage = ''; // Clear any previous error message

        try {
            // Determine if we're using an existing recipient or creating a new one
            let recipient: Recipient;

            if (this.showAddRecipient) {
                // Create new recipient from form data
                const newRecipient = this.remittanceForm.get('newRecipient')?.value;

                // Critical fix: Ensure we're not sending an ID for a new recipient
                if (newRecipient.id) {
                    delete newRecipient.id;
                }

                // Log what we're sending for debugging
                console.log('Sending new recipient data:', JSON.stringify(newRecipient));

                recipient = await lastValueFrom(this.remittanceService.saveRecipient(newRecipient));
            } else {
                // Use existing recipient
                const recipientId = this.remittanceForm.get('recipient')?.value;
                const existingRecipient = this.recipients.find(r => r.id === recipientId);
                if (!existingRecipient) {
                    throw new Error('Selected recipient not found');
                }
                recipient = existingRecipient;
            }

            // Create the transaction data object
            const transactionData: RemittanceTransaction = {
                senderId: this.authService.currentUser?.id || '',
                recipient: recipient,
                amount: Number(this.remittanceForm.get('amount')?.value) || 0,
                currency: this.remittanceForm.get('currency')?.value,
                paymentMethod: this.remittanceForm.get('paymentMethod')?.value,
                fees: this.fees,
                exchangeRate: this.exchangeRate,
                totalAmount: this.totalAmount,
                status: 'pending',
                createdAt: new Date()
            };

            // Validate transaction data
            if (transactionData.amount <= 0) {
                this.errorMessage = 'Amount must be greater than zero';
                this.submitting = false;
                return;
            }

            console.log('Sending transaction data:', JSON.stringify(transactionData));

            // Send the transaction using the correctly named variable
            const result = await lastValueFrom(this.remittanceService.sendMoney(transactionData)
                .pipe(
                    catchError(error => {
                        const errorMsg = error.error?.message || 'Failed to process transaction. Please try again.';
                        this.errorMessage = errorMsg;
                        console.error('Transaction failed:', errorMsg);
                        this.submitting = false;
                        throw error; // rethrow to be caught by outer catch
                    })
                )
            );

            this.submitting = false;

            // Update user balance after successful transaction
            this.loadUserBalance();

            // Store the transaction ID outside the closure for use in the setTimeout
            const transactionId = result?.id;

            // Check if we have a valid transaction ID
            if (transactionId) {
                // If this was a new or edited recipient, show a success message first
                if (this.showAddRecipient) {
                    // This was a new or edited recipient
                    const recipientName = this.remittanceForm.get('newRecipient')?.get('name')?.value;

                    // Show a success message
                    this.successMessage = `Successfully saved recipient "${recipientName}" and completed the transaction.`;

                    // Then navigate after a short delay
                    setTimeout(() => {
                        this.successMessage = '';
                        this.router.navigate(['/transaction-confirmation', transactionId], {
                            // Add unique timestamp to avoid caching issues
                            queryParams: { _t: new Date().getTime() }
                        });
                    }, 2000);
                } else {
                    // Normal flow - navigate immediately
                    this.router.navigate(['/transaction-confirmation', transactionId], {
                        // Add unique timestamp to avoid caching issues
                        queryParams: { _t: new Date().getTime() }
                    });
                }
            }
        } catch (error) {
            console.error('Error processing transaction:', error);
            if (!this.errorMessage) {
                this.errorMessage = 'An unexpected error occurred. Please try again.';
            }
            this.submitting = false;
        }
    }

    cancel(): void {
        this.router.navigate(['/chat'], {
            // Add timestamp to avoid query param conflicts
            queryParams: { _t: new Date().getTime() }
        });
    }
}