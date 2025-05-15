// input-number-only.directive.ts
import { Directive, ElementRef, HostListener, Input } from '@angular/core';

@Directive({
    selector: '[appNumberOnly]',
    standalone: true
})
export class InputNumberOnlyDirective {
    @Input() allowDecimals = true;
    @Input() allowNegative = false;

    constructor(private el: ElementRef) { }

    @HostListener('input', ['$event']) onInputChange(event: Event) {
        const inputElement = event.target as HTMLInputElement;
        const initialValue = inputElement.value;

        let pattern: string;

        if (this.allowDecimals && this.allowNegative) {
            pattern = '^-?[0-9]*(\\.[0-9]*)?$';
        } else if (this.allowDecimals) {
            pattern = '^[0-9]*(\\.[0-9]*)?$';
        } else if (this.allowNegative) {
            pattern = '^-?[0-9]*$';
        } else {
            pattern = '^[0-9]*$';
        }

        const regex = new RegExp(pattern);

        // Replace any invalid input
        if (!regex.test(initialValue)) {
            // Remove invalid characters
            let sanitizedValue = initialValue.replace(/[^0-9.-]/g, '');

            // Ensure only one decimal point
            if (this.allowDecimals) {
                const parts = sanitizedValue.split('.');
                if (parts.length > 2) {
                    sanitizedValue = parts[0] + '.' + parts.slice(1).join('');
                }
            }

            // Ensure only one negative sign at the beginning
            if (this.allowNegative) {
                const negativeCount = (sanitizedValue.match(/-/g) || []).length;
                if (negativeCount > 1 || (negativeCount === 1 && sanitizedValue.indexOf('-') !== 0)) {
                    sanitizedValue = sanitizedValue.replace(/-/g, '');
                    if (sanitizedValue.charAt(0) !== '-') {
                        sanitizedValue = '-' + sanitizedValue;
                    }
                }
            } else {
                sanitizedValue = sanitizedValue.replace(/-/g, '');
            }

            inputElement.value = sanitizedValue;

            // Trigger input event for Angular form update
            const event = new Event('input', { bubbles: true });
            inputElement.dispatchEvent(event);
        }
    }
}