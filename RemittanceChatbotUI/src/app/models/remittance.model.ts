export interface Recipient {
    id?: string;
    name: string;
    accountNumber?: string;
    bankName?: string;
    country: string;
    phoneNumber?: string;
    email?: string;
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
    status: 'draft' | 'pending' | 'processing' | 'completed' | 'failed';
    paymentMethod: string;
    createdAt: Date;
    completedAt?: Date;
    reference?: string;
}