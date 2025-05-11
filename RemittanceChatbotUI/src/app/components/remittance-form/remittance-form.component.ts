import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { RemittanceService } from '../../services/remittance.service';
import { AuthService } from '../../services/auth.service';
import { Recipient, RemittanceTransaction } from '../../models/remittance.model';
import { forkJoin, lastValueFrom } from 'rxjs';

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

    constructor(
        private fb: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private remittanceService: RemittanceService,
        private authService: AuthService
    ) { }

    ngOnInit(): void {
        // Check if user is logged in
        if (!this.authService.isAuthenticated) {
            this.router.navigate(['/login'], {
                queryParams: { returnUrl: this.router.url }
            });
            return;
        }

        this.initForm();
        this.loadRecipients();

        // Get query params if coming from chat
        this.route.queryParams.subscribe(params => {
            if (params['amount']) {
                this.remittanceForm.get('amount')?.setValue(params['amount']);
            }
            if (params['currency']) {
                this.remittanceForm.get('currency')?.setValue(params['currency']);
            }
            if (params['recipient']) {
                // Will need to match by name once recipients are loaded
                const recipientName = params['recipient'];
                this.remittanceForm.get('recipientName')?.setValue(recipientName);
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

    private initForm(): void {
        this.remittanceForm = this.fb.group({
            amount: [null, [Validators.required, Validators.min(1)]],
            currency: ['USD', Validators.required],
            recipient: ['', Validators.required],
            recipientName: [''],
            paymentMethod: ['bank', Validators.required],
            // New recipient fields (hidden by default)
            newRecipient: this.fb.group({
                name: ['', Validators.required],
                accountNumber: ['', Validators.required],
                bankName: ['', Validators.required],
                country: ['', Validators.required],
                email: ['', [Validators.email]],
                phoneNumber: ['']
            })
        });
    }

    private loadRecipients(): void {
        this.loading = true;
        this.remittanceService.getSavedRecipients().subscribe({
            next: (data) => {
                this.recipients = data;
                this.loading = false;

                // Check if we need to select a recipient by name (from chat)
                const recipientName = this.remittanceForm.get('recipientName')?.value;
                if (recipientName) {
                    const foundRecipient = this.recipients.find(r =>
                        r.name.toLowerCase() === recipientName.toLowerCase());
                    if (foundRecipient) {
                        this.remittanceForm.get('recipient')?.setValue(foundRecipient.id);
                    }
                }
            },
            error: (error) => {
                console.error('Error loading recipients:', error);
                this.loading = false;
            }
        });
    }

    toggleAddRecipient(): void {
        this.showAddRecipient = !this.showAddRecipient;
        if (this.showAddRecipient) {
            this.remittanceForm.get('recipient')?.clearValidators();
            this.remittanceForm.get('recipient')?.updateValueAndValidity();
        } else {
            this.remittanceForm.get('recipient')?.setValidators(Validators.required);
            this.remittanceForm.get('recipient')?.updateValueAndValidity();
        }
    }

    updateCalculations(): void {
        const amount = this.remittanceForm.get('amount')?.value || 0;
        const currency = this.remittanceForm.get('currency')?.value || 'USD';
        const method = this.remittanceForm.get('paymentMethod')?.value || 'bank';

        // Skip if amount is not valid
        if (amount <= 0) return;

        forkJoin({
            exchangeRate: this.remittanceService.getExchangeRate('USD', currency),
            fees: this.remittanceService.calculateFees(amount, currency, method)
        }).subscribe({
            next: (result) => {
                this.exchangeRate = result.exchangeRate.rate;
                this.fees = result.fees.fees;
                this.totalAmount = amount + this.fees;
            },
            error: (error) => {
                console.error('Error calculating transaction details:', error);
            }
        });
    }

    async onSubmit(): Promise<void> {
        if (this.remittanceForm.invalid) {
            // Mark all fields as touched to show validation errors
            Object.keys(this.remittanceForm.controls).forEach(key => {
                const control = this.remittanceForm.get(key);
                control?.markAsTouched();
            });
            return;
        }

        this.submitting = true;

        try {
            // Determine if we're using an existing recipient or creating a new one
            let recipient: Recipient;

            if (this.showAddRecipient) {
                // Create new recipient
                const newRecipient = this.remittanceForm.get('newRecipient')?.value as Recipient;
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

            // Process the transaction
            const transaction: RemittanceTransaction = {
                senderId: this.authService.currentUser?.id || '',
                recipient: recipient,
                amount: this.remittanceForm.get('amount')?.value,
                currency: this.remittanceForm.get('currency')?.value,
                paymentMethod: this.remittanceForm.get('paymentMethod')?.value,
                fees: this.fees,
                exchangeRate: this.exchangeRate,
                totalAmount: this.totalAmount,
                status: 'pending',
                createdAt: new Date()
            };

            const result = await lastValueFrom(this.remittanceService.sendMoney(transaction));
            this.submitting = false;

            // Navigate to transaction confirmation page
            this.router.navigate(['/transaction-confirmation', result.id]);
        } catch (error) {
            console.error('Error processing transaction:', error);
            this.submitting = false;
        }
    }

    cancel(): void {
        this.router.navigate(['/']);
    }
}