// loading-indicator.component.ts
import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-loading-indicator',
    standalone: true,
    template: `
    <div class="loading-container" [ngClass]="{'overlay': overlay}">
      <div class="spinner"></div>
      <div *ngIf="message" class="message">{{message}}</div>
    </div>
  `,
    styles: [`
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    
    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(255, 255, 255, 0.7);
      z-index: 1000;
    }
    
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(0, 102, 204, 0.1);
      border-radius: 50%;
      border-top-color: #0066cc;
      animation: spin 1s linear infinite;
    }
    
    .message {
      margin-top: 1rem;
      color: #333;
      font-size: 0.9rem;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class LoadingIndicatorComponent {
    @Input() message = '';
    @Input() overlay = false;
}