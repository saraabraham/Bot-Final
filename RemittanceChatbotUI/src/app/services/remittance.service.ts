import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RemittanceTransaction, Recipient } from '../models/remittance.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class RemittanceService {
    private apiUrl = `${environment.apiUrl}/remittance`;

    constructor(private http: HttpClient) { }

    getExchangeRate(fromCurrency: string, toCurrency: string): Observable<{ rate: number }> {
        return this.http.get<{ rate: number }>(`${this.apiUrl}/rate`, {
            params: { from: fromCurrency, to: toCurrency }
        });
    }

    calculateFees(amount: number, currency: string, method: string): Observable<{ fees: number }> {
        return this.http.get<{ fees: number }>(`${this.apiUrl}/fees`, {
            params: { amount: amount.toString(), currency, method }
        });
    }

    getSavedRecipients(): Observable<Recipient[]> {
        return this.http.get<Recipient[]>(`${this.apiUrl}/recipients`);
    }

    saveRecipient(recipient: Recipient): Observable<Recipient> {
        return this.http.post<Recipient>(`${this.apiUrl}/recipients`, recipient);
    }

    sendMoney(transaction: RemittanceTransaction): Observable<RemittanceTransaction> {
        return this.http.post<RemittanceTransaction>(`${this.apiUrl}/send`, transaction);
    }

    getTransactionHistory(): Observable<RemittanceTransaction[]> {
        return this.http.get<RemittanceTransaction[]>(`${this.apiUrl}/history`);
    }

    getTransactionStatus(id: string): Observable<RemittanceTransaction> {
        return this.http.get<RemittanceTransaction>(`${this.apiUrl}/status/${id}`);
    }
}