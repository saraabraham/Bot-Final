// success-message.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-success-message',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div *ngIf="message" class="success-message">
      <i class="fas fa-check-circle"></i>
      <span>{{message}}</span>
    </div>
  `,
    styles: [`
    .success-message {
      background-color: #d4edda;
      color: #155724;
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
export class SuccessMessageComponent {
    @Input() message = '';
}