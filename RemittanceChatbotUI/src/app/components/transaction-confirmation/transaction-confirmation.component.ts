import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { RemittanceService } from '../../services/remittance.service';
import { RemittanceTransaction } from '../../models/remittance.model';

@Component({
    selector: 'app-transaction-confirmation',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule
    ],
    template: `
    <div class="transaction-confirmation">
      <div class="card">
        <div class="card-header">
          <h2>Transaction Successful!</h2>
          <div class="success-icon">
            <i class="fas fa-check-circle"></i>
          </div>
        </div>
        
        <div class="card-body">
          <div *ngIf="loading" class="loading">
            <p>Loading transaction details...</p>
            <div class="spinner"></div>
          </div>
          
          <div *ngIf="!loading && transaction">
            <div class="confirmation-number">
              <span>Confirmation #:</span>
              <strong>{{ transaction.reference || transaction.id }}</strong>
            </div>
            
            <div class="transaction-details">
              <h3>Transaction Details</h3>
              
              <div class="detail-row">
                <span>Recipient:</span>
                <span>{{ transaction.recipient?.name }}</span>
              </div>
              
              <div class="detail-row">
                <span>Amount:</span>
                <span>{{ transaction.amount | currency:transaction.currency }}</span>
              </div>
              
              <div class="detail-row">
                <span>Fees:</span>
                <span>{{ transaction.fees | currency:transaction.currency }}</span>
              </div>
              
              <div class="detail-row total">
                <span>Total:</span>
                <span>{{ transaction.totalAmount | currency:transaction.currency }}</span>
              </div>
              
              <div class="detail-row">
                <span>Payment Method:</span>
                <span>{{ transaction.paymentMethod | titlecase }}</span>
              </div>
              
              <div class="detail-row">
                <span>Status:</span>
                <span class="status-badge">{{ transaction.status | titlecase }}</span>
              </div>
              
              <div class="detail-row">
                <span>Date & Time:</span>
                <span>{{ transaction.createdAt | date:'medium' }}</span>
              </div>
            </div>
          </div>
          
          <div *ngIf="!loading && !transaction" class="error-message">
            <p>Sorry, we couldn't find your transaction details.</p>
          </div>
        </div>
        
        <div class="card-footer">
          <button class="btn-primary" (click)="goToChat()">Return to Chat</button>
          <button class="btn-secondary" (click)="sendAnother()">Send Another</button>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .transaction-confirmation {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    
    .card {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .card-header {
      background-color: #0066cc;
      color: white;
      padding: 1.5rem;
      text-align: center;
      position: relative;
    }
    
    h2 {
      margin: 0;
      font-size: 1.5rem;
    }
    
    .success-icon {
      margin: 1rem 0;
      font-size: 3rem;
      color: #ffffff;
    }
    
    .card-body {
      padding: 2rem;
    }
    
    .loading {
      text-align: center;
      padding: 2rem 0;
    }
    
    .spinner {
      border: 4px solid rgba(0, 0, 0, 0.1);
      border-radius: 50%;
      border-top: 4px solid #0066cc;
      width: 40px;
      height: 40px;
      margin: 1rem auto;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .confirmation-number {
      background-color: #f5f5f5;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .transaction-details {
      margin-bottom: 1.5rem;
    }
    
    h3 {
      margin-bottom: 1rem;
      font-size: 1.2rem;
      color: #333;
      border-bottom: 1px solid #eee;
      padding-bottom: 0.5rem;
    }
    
    .detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.8rem;
      padding: 0.3rem 0;
    }
    
    .detail-row.total {
      font-weight: bold;
      font-size: 1.1rem;
      border-top: 1px solid #eee;
      padding-top: 0.8rem;
      margin-top: 0.5rem;
    }
    
    .status-badge {
      background-color: #4caf50;
      color: white;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    
    .card-footer {
      padding: 1.5rem;
      background-color: #f9f9f9;
      display: flex;
      justify-content: space-between;
      gap: 1rem;
    }
    
    button {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 4px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .btn-primary {
      background-color: #0066cc;
      color: white;
    }
    
    .btn-primary:hover {
      background-color: #0057b3;
    }
    
    .btn-secondary {
      background-color: #f2f2f2;
      color: #333;
    }
    
    .btn-secondary:hover {
      background-color: #e6e6e6;
    }
    
    .error-message {
      color: #e74c3c;
      text-align: center;
      padding: 2rem 0;
    }
    
    @media (max-width: 768px) {
      .card-footer {
        flex-direction: column;
      }
      
      button {
        width: 100%;
      }
    }
  `]
})
export class TransactionConfirmationComponent implements OnInit {
    transaction: RemittanceTransaction | null = null;
    loading = true;
    error = '';

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private remittanceService: RemittanceService
    ) { }

    ngOnInit(): void {
        // Get the transaction ID from the route parameters
        this.route.paramMap.subscribe(params => {
            const id = params.get('id');

            if (id) {
                this.loadTransaction(id);
            } else {
                this.loading = false;
                this.error = 'Transaction ID not found';
            }
        });
    }

    private loadTransaction(id: string): void {
        this.remittanceService.getTransactionStatus(id)
            .subscribe({
                next: (transaction) => {
                    this.transaction = transaction;
                    this.loading = false;
                },
                error: (error) => {
                    console.error('Error loading transaction:', error);
                    this.error = 'Failed to load transaction details';
                    this.loading = false;
                }
            });
    }

    goToChat(): void {
        this.router.navigate(['/chat']);
    }

    sendAnother(): void {
        this.router.navigate(['/send-money']);
    }
}
