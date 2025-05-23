import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { RemittanceTransaction, Recipient } from '../models/remittance.model';
import { environment } from '../../environments/environment';
import { delay, map } from 'rxjs/operators';


// Add this interface
export interface UserBalance {
    balance: number;
    currency: string;
}

// Add this interface for deposit
export interface DepositRequest {
    amount: number;
    currency: string;
    paymentMethod: string;
    cardDetails?: {
        cardNumber: string;
        expiryDate: string;
        cvv: string;
        cardHolderName: string;
    };
}

// Add this interface for deposit response
export interface DepositResponse {
    id: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    status: string;
    timestamp: Date;
    transactionRef: string;
}
// Add this interface for deposit
export interface DepositRequest {
    amount: number;
    currency: string;
    paymentMethod: string;
    cardDetails?: {
        cardNumber: string;
        expiryDate: string;
        cvv: string;
        cardHolderName: string;
    };
}

// Add this interface for deposit response
export interface DepositResponse {
    id: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    status: string;
    timestamp: Date;
    transactionRef: string;
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

    // Add method for deposits
    depositMoney(depositRequest: DepositRequest): Observable<DepositResponse> {
        console.log('Processing deposit request:', depositRequest);
        return this.http.post<DepositResponse>(`${this.apiUrl}/deposit`, depositRequest)
            .pipe(
                tap(result => console.log('Deposit result:', result)),
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
    addRecipientToUserSaved(recipientId: string): Observable<any> {
        console.log(`Adding recipient ${recipientId} to user's saved recipients`);

        // Create endpoint URL - you'll need to implement this endpoint in your backend
        const url = `${this.apiUrl}/recipients/add-to-saved`;

        // Make the API call to update the user's saved recipients
        return this.http.post(url, { recipientId }).pipe(
            tap(response => {
                console.log('Recipient added to saved list:', response);
            }),
            catchError(error => {
                console.error('Error adding recipient to saved list:', error);

                // If the backend endpoint doesn't exist yet, we'll implement a fallback
                // This is temporary until you implement the proper endpoint
                return this.getSavedRecipients().pipe(
                    tap(() => {
                        console.log('Refreshed recipients list after adding new recipient');
                    })
                );
            })
        );
    }
    findRecipientByName(name: string): Observable<Recipient | null> {
        console.log(`Finding recipient by name: "${name}"`);

        // First try to find recipient in cache
        return this.getSavedRecipients().pipe(
            map(recipients => {
                if (!recipients || recipients.length === 0 || !name) {
                    return null;
                }

                // Normalize search name
                const searchName = name.toLowerCase().trim();

                // Try exact match first
                let match = recipients.find(r =>
                    r.name.toLowerCase().trim() === searchName
                );

                // If no match, try fuzzy matching
                if (!match) {
                    match = recipients.find(r =>
                        r.name.toLowerCase().includes(searchName) ||
                        searchName.includes(r.name.toLowerCase())
                    );
                }

                return match || null;
            })
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
        console.log('Getting transaction history from real backend');

        // The issue might be that the JWT token doesn't have the 'sub' claim
        // or it's not being correctly extracted by the backend

        return this.http.get<RemittanceTransaction[]>(`${this.apiUrl}/history`)
            .pipe(
                tap(transactions => {
                    console.log('Transaction history retrieved successfully:', transactions);
                }),
                catchError((error: HttpErrorResponse) => {
                    console.error('Error getting transaction history:', error);

                    if (error.status === 400) {
                        // The backend is returning BadRequest, likely because it can't find the user ID
                        // This suggests an issue with how the token is being processed
                        console.error('Backend error 400 - likely a user ID issue in the token');

                        // Get the error message from the response if available
                        let errorMsg = 'Transaction history unavailable';

                        if (error.error && typeof error.error === 'object' && error.error.message) {
                            errorMsg = `Error: ${error.error.message}`;
                            console.error('Server error message:', error.error.message);
                        }

                        // Return an empty array and handle it gracefully in the UI
                        // This prevents a complete failure and shows the user a more helpful message
                        return ([]);
                    }

                    return throwError(() => error);
                }),
                // Always return an array, even if backend returns null
                map(transactions => Array.isArray(transactions) ? transactions : [])
            );
    }
    getTransactionStatus(id: string): Observable<RemittanceTransaction> {
        return this.http.get<RemittanceTransaction>(`${this.apiUrl}/status/${id}`)
            .pipe(catchError(this.handleError));
    }

}