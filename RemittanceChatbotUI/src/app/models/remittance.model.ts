// Update to remittance.model.ts - Frontend model update to add SenderId field

export interface Recipient {
    id?: string;
    name: string;
    accountNumber?: string;
    bankName?: string;
    country: string;
    phoneNumber?: string;
    email?: string;
    senderId?: string; // Added field to track which user created this recipient
}

export interface RemittanceTransaction {
    id?: string;
    senderId: string;
    recipient: Recipient;
    amount: number;
    currency: string;
    exchangeRate?: number;
    fees?: number;
    totalAmount?: number;
    status: string; // This is 'draft', 'pending', 'processing', 'completed', or 'failed'
    paymentMethod: string;
    createdAt: Date;
    completedAt?: Date;
    reference?: string;
}