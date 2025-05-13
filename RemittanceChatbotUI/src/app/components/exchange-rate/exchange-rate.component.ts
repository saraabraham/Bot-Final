import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { RemittanceService } from '../../services/remittance.service';

@Component({
    selector: 'app-exchange-rate',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterModule
    ],
    templateUrl: './exchange-rate.component.html',
    styleUrls: ['./exchange-rate.component.scss']
})
export class ExchangeRateComponent implements OnInit {
    rateForm!: FormGroup;
    loading = false;
    errorMessage = '';
    currencies = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'HKD', 'SGD'];
    exchangeRate: number | null = null;
    fromAmount = 1;
    toAmount = 0;
    historicalRates: { date: string, rate: number }[] = [];

    // Popular currency pairs
    popularPairs = [
        { from: 'USD', to: 'EUR' },
        { from: 'USD', to: 'GBP' },
        { from: 'EUR', to: 'USD' },
        { from: 'USD', to: 'JPY' },
        { from: 'GBP', to: 'USD' },
        { from: 'USD', to: 'INR' }
    ];

    // Last 7 days for demo historical rates
    last7Days: string[] = [];

    constructor(
        private fb: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private remittanceService: RemittanceService
    ) {
        // Generate last 7 days for demo historical data
        const today = new Date();
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(today.getDate() - i);
            this.last7Days.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        }
    }

    ngOnInit(): void {
        this.initForm();

        // Get query params if coming from chat
        this.route.queryParams.subscribe(params => {
            if (params['fromCurrency']) {
                this.rateForm.get('fromCurrency')?.setValue(params['fromCurrency']);
            }
            if (params['toCurrency']) {
                this.rateForm.get('toCurrency')?.setValue(params['toCurrency']);
            }

            // If both currencies are provided, fetch the rate
            if (params['fromCurrency'] && params['toCurrency']) {
                this.getExchangeRate();
            }
        });
    }

    private initForm(): void {
        this.rateForm = this.fb.group({
            fromCurrency: ['USD', Validators.required],
            toCurrency: ['EUR', Validators.required],
            amount: [1, [Validators.required, Validators.min(0.01)]]
        });

        // Subscribe to form changes to automatically update rates
        this.rateForm.valueChanges.subscribe(() => {
            if (this.rateForm.valid) {
                this.getExchangeRate();
            }
        });
    }

    getExchangeRate(): void {
        const fromCurrency = this.rateForm.get('fromCurrency')?.value;
        const toCurrency = this.rateForm.get('toCurrency')?.value;
        const amount = this.rateForm.get('amount')?.value || 1;

        this.fromAmount = amount;

        if (fromCurrency === toCurrency) {
            this.exchangeRate = 1;
            this.toAmount = this.fromAmount;
            this.generateMockHistoricalRates(1);
            return;
        }

        this.loading = true;
        this.remittanceService.getExchangeRate(fromCurrency, toCurrency)
            .subscribe({
                next: (result) => {
                    this.exchangeRate = result.rate;
                    this.toAmount = this.fromAmount * result.rate;
                    this.loading = false;

                    // Generate mock historical rates for demo
                    this.generateMockHistoricalRates(result.rate);
                },
                error: (error) => {
                    console.error('Error fetching exchange rate:', error);
                    this.errorMessage = 'Unable to fetch exchange rate. Please try again later.';
                    this.loading = false;
                    this.exchangeRate = null;
                }
            });
    }

    swapCurrencies(): void {
        const fromCurrency = this.rateForm.get('fromCurrency')?.value;
        const toCurrency = this.rateForm.get('toCurrency')?.value;

        this.rateForm.patchValue({
            fromCurrency: toCurrency,
            toCurrency: fromCurrency
        });
    }

    // For demo purposes, generate mock historical rates
    private generateMockHistoricalRates(currentRate: number): void {
        this.historicalRates = [];
        for (let i = 0; i < 7; i++) {
            // Create some random variation (+/- 2%)
            const randomVariation = 0.04 * Math.random() - 0.02;
            const rate = currentRate * (1 + randomVariation);
            this.historicalRates.push({
                date: this.last7Days[i],
                rate: parseFloat(rate.toFixed(4))
            });
        }
    }

    selectPopularPair(from: string, to: string): void {
        this.rateForm.patchValue({
            fromCurrency: from,
            toCurrency: to
        });
    }

    goBack(): void {
        this.router.navigate(['/chat']);
    }
}