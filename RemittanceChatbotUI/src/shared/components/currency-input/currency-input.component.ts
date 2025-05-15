// currency-input.component.ts
import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
    selector: 'app-currency-input',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="currency-input">
      <span class="currency-symbol">{{currencySymbol}}</span>
      <input 
        type="text" 
        [placeholder]="placeholder"
        [disabled]="disabled"
        [value]="displayValue"
        (input)="onInput($event)"
        (blur)="onBlur()"
      />
    </div>
  `,
    styles: [`
    .currency-input {
      position: relative;
      
      .currency-symbol {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: #666;
      }
      
      input {
        width: 100%;
        padding: 0.75rem 0.75rem 0.75rem 25px;
        border: 1px solid #ddd;
        border-radius: 4px;
        
        &:focus {
          outline: none;
          border-color: #0066cc;
        }
        
        &:disabled {
          background-color: #f5f5f5;
        }
      }
    }
  `],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => CurrencyInputComponent),
            multi: true
        }
    ]
})
export class CurrencyInputComponent implements ControlValueAccessor {
    @Input() currency = 'USD';
    @Input() placeholder = '0.00';

    disabled = false;
    value = 0;
    displayValue = '';

    private onChange: (value: number) => void = () => { };
    private onTouched: () => void = () => { };

    get currencySymbol(): string {
        switch (this.currency) {
            case 'USD': return '$';
            case 'EUR': return '€';
            case 'GBP': return '£';
            default: return this.currency;
        }
    }

    onInput(event: Event): void {
        const input = event.target as HTMLInputElement;
        const rawValue = input.value.replace(/[^\d.]/g, '');

        // Format for display
        this.displayValue = rawValue;

        // Convert to number for model
        const numericValue = parseFloat(rawValue);
        this.value = isNaN(numericValue) ? 0 : numericValue;

        this.onChange(this.value);
    }

    onBlur(): void {
        // Format nicely on blur
        this.displayValue = this.value.toFixed(2);
        this.onTouched();
    }

    // ControlValueAccessor implementation
    writeValue(value: number): void {
        this.value = value || 0;
        this.displayValue = this.value.toFixed(2);
    }

    registerOnChange(fn: (value: number) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.disabled = isDisabled;
    }
}