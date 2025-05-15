// currency-formatter.pipe.ts
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'currencyFormatter',
    standalone: true
})
export class CurrencyFormatterPipe implements PipeTransform {
    transform(value: number, currency: string = 'USD', showSymbol: boolean = true): string {
        if (value === null || value === undefined) {
            return '';
        }

        let symbol = '';
        if (showSymbol) {
            switch (currency) {
                case 'USD': symbol = '$'; break;
                case 'EUR': symbol = '€'; break;
                case 'GBP': symbol = '£'; break;
                case 'INR': symbol = '₹'; break;
                default: symbol = currency + ' ';
            }
        }

        // Format with 2 decimal places
        const formattedValue = value.toFixed(2);

        // Add thousand separators
        const parts = formattedValue.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        return symbol + parts.join('.');
    }
}