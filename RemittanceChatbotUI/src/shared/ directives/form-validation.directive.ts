// form-validation.directive.ts
import { Directive, ElementRef, HostListener, Input, OnInit } from '@angular/core';
import { AbstractControl, NgControl } from '@angular/forms';

@Directive({
    selector: '[appFormValidation]',
    standalone: true
})
export class FormValidationDirective implements OnInit {
    @Input() appFormValidation: string = ''; // Custom error message

    private defaultErrorMessages: { [key: string]: string } = {
        required: 'This field is required',
        email: 'Please enter a valid email address',
        minlength: 'This field is too short',
        maxlength: 'This field is too long',
        min: 'Value is too small',
        max: 'Value is too large',
        pattern: 'Invalid format'
    };

    private errorElement?: HTMLElement;

    constructor(
        private el: ElementRef,
        private control: NgControl
    ) { }

    ngOnInit(): void {
        // Create error element container
        this.errorElement = document.createElement('div');
        this.errorElement.className = 'validation-error';
        this.errorElement.style.color = '#e74c3c';
        this.errorElement.style.fontSize = '0.8rem';
        this.errorElement.style.marginTop = '0.3rem';
        this.errorElement.style.display = 'none';

        // Add after the input element
        this.el.nativeElement.parentNode.insertBefore(
            this.errorElement,
            this.el.nativeElement.nextSibling
        );
    }

    @HostListener('blur')
    onBlur(): void {
        this.validateAndShowError();
    }

    private validateAndShowError(): void {
        if (!this.control || !this.control.control) return;

        const control = this.control.control;

        // Hide error initially
        if (this.errorElement) {
            this.errorElement.style.display = 'none';
        }

        // Check if control is invalid and touched/dirty
        if (control.invalid && (control.touched || control.dirty)) {
            const errors = control.errors;
            if (errors && this.errorElement) {
                // Use custom message if provided, otherwise use default for first error
                let errorMessage = this.appFormValidation;

                if (!errorMessage) {
                    // Find the first error and use its default message
                    const errorType = Object.keys(errors)[0];
                    errorMessage = this.getErrorMessage(errorType, control);
                }

                this.errorElement.textContent = errorMessage;
                this.errorElement.style.display = 'block';
            }
        }
    }

    private getErrorMessage(errorType: string, control: AbstractControl): string {
        const defaultMessage = this.defaultErrorMessages[errorType] || 'Invalid value';

        // For min/max/length errors, include the actual constraint value
        if (errorType === 'minlength' || errorType === 'maxlength') {
            const requiredLength = control.errors?.[errorType].requiredLength;
            return defaultMessage + ` (${requiredLength} characters)`;
        } else if (errorType === 'min' || errorType === 'max') {
            const constraint = control.errors?.[errorType][errorType];
            return defaultMessage + ` (${constraint})`;
        }

        return defaultMessage;
    }
}