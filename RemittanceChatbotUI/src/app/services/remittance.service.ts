// Update the remittance.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { RemittanceTransaction, Recipient } from '../models/remittance.model';
import { environment } from '../../environments/environment';

// Add this interface
export interface UserBalance {
    balance: number;
    currency: string;
}

@Injectable({
    providedIn: 'root'
})
export class RemittanceService {
    private apiUrl = `${environment.apiUrl}/remittance`;

    constructor(private http: HttpClient) { }

    private handleError(error: HttpErrorResponse) {
        console.error('API Error:', error);

        let errorMessage = 'An unknown error occurred';
        if (error.error instanceof ErrorEvent) {
            // Client-side error
            errorMessage = `Error: ${error.error.message}`;
        } else {
            // Server-side error
            errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;

            // Log detailed server response if available
            if (error.error) {
                console.error('Server error details:', error.error);
            }
        }

        // Return an observable with a user-facing error message
        return throwError(() => new Error(errorMessage));
    }

    // Add method to check user balance
    getUserBalance(): Observable<UserBalance> {
        return this.http.get<UserBalance>(`${this.apiUrl}/balance`)
            .pipe(
                tap(balance => console.log('Balance received:', balance)),
                catchError(this.handleError)
            );
    }

    // Add method to find or create a recipient
    findOrCreateRecipient(name: string): Observable<Recipient> {
        return this.http.post<Recipient>(`${this.apiUrl}/recipients/find-or-create`, { name })
            .pipe(
                tap(recipient => console.log('Recipient found or created:', recipient)),
                catchError(this.handleError)
            );
    }

    getExchangeRate(fromCurrency: string, toCurrency: string): Observable<{ rate: number }> {
        return this.http.get<{ rate: number }>(`${this.apiUrl}/rate`, {
            params: { from: fromCurrency, to: toCurrency }
        }).pipe(
            catchError(this.handleError)
        );
    }

    calculateFees(amount: number, currency: string, method: string): Observable<{ fees: number }> {
        return this.http.get<{ fees: number }>(`${this.apiUrl}/fees`, {
            params: { amount: amount.toString(), currency, method }
        }).pipe(
            catchError(this.handleError)
        );
    }

    getSavedRecipients(): Observable<Recipient[]> {
        return this.http.get<Recipient[]>(`${this.apiUrl}/recipients`)
            .pipe(
                tap(recipients => console.log('Recipients received:', recipients)),
                catchError(this.handleError)
            );
    }

    saveRecipient(recipient: Recipient): Observable<Recipient> {
        console.log('Saving recipient:', recipient);
        return this.http.post<Recipient>(`${this.apiUrl}/recipients`, recipient)
            .pipe(
                tap(saved => console.log('Recipient saved:', saved)),
                catchError(this.handleError)
            );
    }

    sendMoney(transaction: RemittanceTransaction): Observable<RemittanceTransaction> {
        console.log('Sending transaction:', transaction);
        // Validate transaction data before sending to the server
        const validationErrors: string[] = [];

        if (!transaction.recipient || !transaction.recipient.id) {
            validationErrors.push('Missing recipient information');
        }

        if (!transaction.amount || transaction.amount <= 0) {
            validationErrors.push('Amount must be greater than zero');
        }

        if (!transaction.currency) {
            validationErrors.push('Currency is required');
        }

        if (!transaction.paymentMethod) {
            validationErrors.push('Payment method is required');
        }

        // If validation errors exist, return error observable
        if (validationErrors.length > 0) {
            console.error('Validation errors:', validationErrors);
            return throwError(() => new Error(validationErrors.join('. ')));
        }

        // Format dates correctly for backend
        const formattedTransaction = {
            ...transaction,
            createdAt: new Date().toISOString()
        };

        return this.http.post<RemittanceTransaction>(`${this.apiUrl}/send`, formattedTransaction)
            .pipe(
                tap(result => console.log('Transaction result:', result)),
                catchError(this.handleError)
            );
    }

    getTransactionHistory(): Observable<RemittanceTransaction[]> {
        return this.http.get<RemittanceTransaction[]>(`${this.apiUrl}/history`)
            .pipe(catchError(this.handleError));
    }

    getTransactionStatus(id: string): Observable<RemittanceTransaction> {
        return this.http.get<RemittanceTransaction>(`${this.apiUrl}/status/${id}`)
            .pipe(catchError(this.handleError));
    }
}