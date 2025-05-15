// error-message.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-error-message',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div *ngIf="message" class="error-message">
      <i class="fas fa-exclamation-circle"></i>
      <span>{{message}}</span>
    </div>
  `,
    styles: [`
    .error-message {
      background-color: #f8d7da;
      color: #721c24;
      padding: 0.75rem 1rem;
      border-radius: 4px;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      
      i {
        margin-right: 0.5rem;
      }
    }
  `]
})
export class ErrorMessageComponent {
    @Input() message = '';
}