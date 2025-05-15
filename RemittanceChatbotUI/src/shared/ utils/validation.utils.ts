// validation.utils.ts
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validates that the input is a valid email address
 */
export function emailValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        if (!control.value) return null;

        const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const valid = emailPattern.test(control.value);

        return valid ? null : { email: true };
    };
}

/**
 * Validates that the input is a valid phone number
 */
export function phoneValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        if (!control.value) return null;

        // Basic international phone format with optional country code
        const phonePattern = /^\+?[0-9]{7,15}$/;
        const valid = phonePattern.test(control.value.replace(/[\s()-]/g, ''));

        return valid ? null : { phone: true };
    };
}

/**
 * Validates that the input is a valid account number
 */
export function accountNumberValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        if (!control.value) return null;

        // Account numbers should be numeric and between 8-20 digits
        const accountPattern = /^[0-9]{8,20}$/;
        const valid = accountPattern.test(control.value.replace(/[\s-]/g, ''));

        return valid ? null : { accountNumber: true };
    };
}

/**
 * Validates that the input is a valid card number
 */
export function cardNumberValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        if (!control.value) return null;

        // Card numbers should be 13-19 digits
        const cardPattern = /^[0-9]{13,19}$/;
        const sanitized = control.value.replace(/[\s-]/g, '');
        const valid = cardPattern.test(sanitized) && luhnCheck(sanitized);

        return valid ? null : { cardNumber: true };
    };
}

/**
 * Implementation of the Luhn algorithm for card validation
 */
function luhnCheck(cardNumber: string): boolean {
    let sum = 0;
    let shouldDouble = false;

    // Loop from right to left
    for (let i = cardNumber.length - 1; i >= 0; i--) {
        let digit = parseInt(cardNumber.charAt(i), 10);

        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }

        sum += digit;
        shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
}

/**
 * Validates that the input is a valid card expiry date (MM/YY)
 */
export function expiryDateValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        if (!control.value) return null;

        // Check format MM/YY
        const expiryPattern = /^(0[1-9]|1[0-2])\/([0-9]{2})$/;
        if (!expiryPattern.test(control.value)) {
            return { expiryDate: true };
        }

        // Check that expiry date is in the future
        const [month, year] = control.value.split('/');
        const expiryDate = new Date(2000 + parseInt(year, 10), parseInt(month, 10) - 1, 1);
        const today = new Date();
        today.setDate(1);
        today.setHours(0, 0, 0, 0);

        return expiryDate >= today ? null : { expiryDatePast: true };
    };
}