// Update the chat.service.ts

import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError, catchError, tap, switchMap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, MessageSender, BotCommand } from '../models/message.model';
import { environment } from '../../environments/environment';
import { isPlatformBrowser } from '@angular/common';
import { RemittanceService, UserBalance } from './remittance.service';
import { Recipient } from '../models/remittance.model';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class ChatService {
    private messages = new BehaviorSubject<ChatMessage[]>([]);
    public messages$ = this.messages.asObservable();

    private apiUrl = `${environment.apiUrl}/chat`;
    private isBrowser: boolean;


    private userBalance: UserBalance | null = null;

    constructor(
        private http: HttpClient,
        private remittanceService: RemittanceService,
        private authService: AuthService,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        this.isBrowser = isPlatformBrowser(this.platformId);

        // Initialize with welcome message
        this.addMessage({
            id: uuidv4(),
            text: 'Welcome to our remittance chatbot! How can I help you today? You can send money, check rates, check your balance, or manage recipients.',
            sender: MessageSender.BOT,
            timestamp: new Date()
        });

        // Load chat history if user is authenticated
        this.loadChatHistory();

        // Load user balance if authenticated
        if (this.authService.isAuthenticated) {
            this.loadUserBalance();
        }

        // Subscribe to authentication changes
        this.authService.currentUser$.subscribe(user => {
            if (user?.isAuthenticated) {
                this.loadUserBalance();
            } else {
                this.userBalance = null;
            }
        });
    }

    private loadUserBalance(): void {
        this.remittanceService.getUserBalance()
            .subscribe({
                next: (balance) => {
                    console.log('User balance loaded:', balance);
                    this.userBalance = balance;
                },
                error: (error) => {
                    console.error('Error loading user balance:', error);
                }
            });
    }

    private loadChatHistory(): void {
        // Only attempt to load history if in a browser environment
        if (!this.isBrowser) return;

        // Only attempt to load history if the user is logged in
        const token = this.authService.authToken;
        if (!token) return;

        this.http.get<ChatMessage[]>(`${this.apiUrl}/history`)
            .subscribe({
                next: (history) => {
                    if (history && history.length > 0) {
                        // Replace our welcome message with the actual history
                        this.messages.next(history.map(msg => ({
                            ...msg,
                            timestamp: new Date(msg.timestamp), // Convert string dates to Date objects
                            sender: msg.sender === 'user' ? MessageSender.USER : MessageSender.BOT
                        })));
                    }
                },
                error: (error) => {
                    console.error('Error loading chat history:', error);
                }
            });
    }

    private addMessage(message: ChatMessage): void {
        const currentMessages = this.messages.value;
        this.messages.next([...currentMessages, message]);
    }

    sendMessage(text: string): Observable<BotCommand> {
        // Add user message to chat
        const userMessageId = uuidv4();
        this.addMessage({
            id: userMessageId,
            text,
            sender: MessageSender.USER,
            timestamp: new Date()
        });

        // Add temporary bot message showing "typing" state
        const botMessageId = uuidv4();
        this.addMessage({
            id: botMessageId,
            text: '',
            sender: MessageSender.BOT,
            timestamp: new Date(),
            isProcessing: true
        });

        // Process message locally first to check for send money intents
        const sendMoneyMatch = text.match(/(?:send|transfer|remit)\s+(?:(?:\$?\s*)?([\d,.]+))?\s*(?:dollars|euro|pound|usd|eur|gbp)?\s+(?:to\s+)(\w+)/i);

        // Check if this is a send money request and user is authenticated
        if (sendMoneyMatch && this.authService.isAuthenticated) {
            console.log('Detected send money intent locally:', sendMoneyMatch);

            const amount = sendMoneyMatch[1] ? parseFloat(sendMoneyMatch[1].replace(/[$,]/g, '')) : 0;
            const recipientName = sendMoneyMatch[2];

            // Set pending transaction details
            this.pendingTransaction = {
                amount: amount,
                currency: 'USD', // Default, will be updated from server response if available
                recipient: recipientName
            };

            // Process locally with preliminary checks
            return this.processMoneyTransferIntent(amount, recipientName, botMessageId);
        }

        // Send to backend for processing
        return this.http.post<BotCommand>(`${this.apiUrl}/message`, { text }).pipe(
            tap(response => {
                // Update messages to replace the "typing" message with the actual response
                const currentMessages = this.messages.value;
                const updatedMessages = currentMessages.map(msg => {
                    if (msg.id === botMessageId) {
                        return {
                            ...msg,
                            text: response.text || this.generateBotResponse(response),
                            isProcessing: false
                        };
                    }
                    return msg;
                });
                this.messages.next(updatedMessages);

                // Save any entities for context
                if (response.intent === 'send_money' && response.entities) {
                    if (response.entities['amount']) {
                        this.pendingTransaction.amount = parseFloat(response.entities['amount'].toString());
                    }
                    if (response.entities['currency']) {
                        this.pendingTransaction.currency = response.entities['currency'].toString();
                    }
                    if (response.entities['recipient']) {
                        this.pendingTransaction.recipient = response.entities['recipient'].toString();
                    }
                }
            })
        );
    }

    // New method to handle money transfer intent locally
    private processMoneyTransferIntent(amount: number, recipientName: string, botMessageId: string): Observable<BotCommand> {
        // Check if we need to fetch the balance
        if (!this.userBalance) {
            return this.remittanceService.getUserBalance().pipe(
                tap(balance => {
                    this.userBalance = balance;
                }),
                switchMap(balance => this.continueMoneyTransferProcessing(amount, recipientName, botMessageId, balance))
            );
        } else {
            return this.continueMoneyTransferProcessing(amount, recipientName, botMessageId, this.userBalance);
        }
    }

    // Continue processing after getting the balance
    // Update in chat.service.ts

    // Inside the ChatService class, update the continueMoneyTransferProcessing method:

    private continueMoneyTransferProcessing(
        amount: number,
        recipientName: string,
        botMessageId: string,
        balance: UserBalance
    ): Observable<BotCommand> {
        // Calculate approximate fees
        return this.remittanceService.calculateFees(amount, balance.currency, 'bank').pipe(
            switchMap(feesResponse => {
                const fees = feesResponse.fees;
                const totalAmount = amount + fees;

                // Check if user has sufficient balance
                if (balance.balance < totalAmount) {
                    // Insufficient balance
                    const response = {
                        intent: 'send_money',
                        entities: {
                            amount: amount,
                            recipient: recipientName,
                            currency: balance.currency
                        },
                        confidence: 0.9,
                        text: `I'm sorry, you don't have enough balance to send ${amount} ${balance.currency}. ` +
                            `Your current balance is ${balance.balance} ${balance.currency}, but you need ` +
                            `${totalAmount} ${balance.currency} (including fees of ${fees} ${balance.currency}).`
                    };

                    // Update bot message
                    this.updateBotMessage(botMessageId, response.text);
                    return of(response);
                }

                // First get all saved recipients to check if this recipient exists
                return this.remittanceService.getSavedRecipients().pipe(
                    switchMap(recipients => {
                        // Check if recipient exists (case insensitive)
                        const existingRecipient = recipients.find(r =>
                            r.name.toLowerCase() === recipientName.toLowerCase());

                        if (!existingRecipient) {
                            // Recipient doesn't exist, ask if user wants to create a new one
                            const responseText = `I'd like to send ${amount} ${balance.currency} to ${recipientName}, ` +
                                `but they're not in your saved recipients list. This would cost a total of ` +
                                `${totalAmount} ${balance.currency} including fees. ` +
                                `Would you like to add ${recipientName} as a new recipient?`;

                            const response = {
                                intent: 'send_money',
                                entities: {
                                    amount: amount,
                                    recipient: recipientName,
                                    currency: balance.currency,
                                    fees: fees,
                                    totalAmount: totalAmount,
                                    recipientExists: false
                                },
                                confidence: 0.9,
                                text: responseText
                            };

                            // Update bot message
                            this.updateBotMessage(botMessageId, responseText);

                            // Store relevant info in pending transaction
                            this.pendingTransaction = {
                                amount: amount,
                                currency: balance.currency,
                                recipient: recipientName,
                                recipientExists: false
                            };

                            return of(response);
                        }

                        // Recipient exists, check if we need more details
                        if (!existingRecipient.accountNumber || existingRecipient.country === 'Unknown') {
                            // Existing recipient but incomplete details
                            const responseText = `I found ${recipientName} in your recipients list, but their details are incomplete. ` +
                                `I can send ${amount} ${balance.currency} to them, which will cost a total of ` +
                                `${totalAmount} ${balance.currency} including fees. ` +
                                `Would you like to complete their profile first?`;

                            const response = {
                                intent: 'send_money',
                                entities: {
                                    amount: amount,
                                    recipient: recipientName,
                                    recipientId: existingRecipient.id,
                                    currency: balance.currency,
                                    fees: fees,
                                    totalAmount: totalAmount,
                                    recipientExists: true,
                                    recipientComplete: false
                                },
                                confidence: 0.9,
                                text: responseText
                            };

                            // Update bot message
                            this.updateBotMessage(botMessageId, responseText);

                            // Store recipient ID in pending transaction
                            this.pendingTransaction = {
                                amount: amount,
                                currency: balance.currency,
                                recipient: recipientName,
                                recipientId: existingRecipient.id,
                                recipientExists: true,
                                recipientComplete: false
                            };

                            return of(response);
                        }

                        // Existing recipient with complete details
                        const responseText = `I can send ${amount} ${balance.currency} to your saved recipient ${recipientName}. ` +
                            `This will cost a total of ${totalAmount} ${balance.currency} including fees of ` +
                            `${fees} ${balance.currency}. Your balance after this transaction would be ` +
                            `${balance.balance - totalAmount} ${balance.currency}. ` +
                            `Shall I proceed with the transfer?`;

                        const response = {
                            intent: 'send_money',
                            entities: {
                                amount: amount,
                                recipient: recipientName,
                                recipientId: existingRecipient.id,
                                currency: balance.currency,
                                fees: fees,
                                totalAmount: totalAmount,
                                recipientExists: true,
                                recipientComplete: true
                            },
                            confidence: 0.9,
                            text: responseText
                        };

                        // Update bot message
                        this.updateBotMessage(botMessageId, responseText);

                        // Store recipient ID in pending transaction
                        this.pendingTransaction = {
                            amount: amount,
                            currency: balance.currency,
                            recipient: recipientName,
                            recipientId: existingRecipient.id,
                            recipientExists: true,
                            recipientComplete: true
                        };

                        return of(response);
                    }),
                    catchError(error => {
                        console.error('Error checking recipients:', error);
                        const errorText = `I had trouble finding information about ${recipientName}. ` +
                            `Would you like to add them as a new recipient?`;

                        const response = {
                            intent: 'send_money',
                            entities: {
                                amount: amount,
                                recipient: recipientName,
                                currency: balance.currency,
                                recipientExists: false
                            },
                            confidence: 0.9,
                            text: errorText
                        };

                        this.updateBotMessage(botMessageId, errorText);
                        return of(response);
                    })
                );
            }),
            catchError(error => {
                console.error('Error calculating fees:', error);
                const errorText = `I'm having trouble processing your request to send money to ${recipientName}. ` +
                    `Please try again later.`;

                const response = {
                    intent: 'send_money',
                    entities: {
                        amount: amount,
                        recipient: recipientName
                    },
                    confidence: 0.9,
                    text: errorText
                };

                this.updateBotMessage(botMessageId, errorText);
                return of(response);
            })
        );
    }

    // Update the chat service "pendingTransaction" property type 
    private pendingTransaction: {
        amount?: number;
        currency?: string;
        recipient?: string;
        recipientId?: string;
        recipientExists?: boolean;
        recipientComplete?: boolean;
    } = {};
    // Helper method to update bot message text
    private updateBotMessage(messageId: string, text: string): void {
        const currentMessages = this.messages.value;
        const updatedMessages = currentMessages.map(msg => {
            if (msg.id === messageId) {
                return {
                    ...msg,
                    text: text,
                    isProcessing: false
                };
            }
            return msg;
        });
        this.messages.next(updatedMessages);
    }

    processVoiceInput(audioBlob: Blob): Observable<BotCommand> {
        const formData = new FormData();
        formData.append('audio', audioBlob);

        // Add temporary user message
        const userMessageId = uuidv4();
        this.addMessage({
            id: userMessageId,
            text: '🎤 Processing voice input...',
            sender: MessageSender.USER,
            timestamp: new Date()
        });

        // Add temporary bot message showing "typing" state
        const botMessageId = uuidv4();
        this.addMessage({
            id: botMessageId,
            text: '',
            sender: MessageSender.BOT,
            timestamp: new Date(),
            isProcessing: true
        });

        return this.http.post<BotCommand>(`${this.apiUrl}/voice`, formData).pipe(
            tap(response => {
                // Update the user message with transcribed text
                const currentMessages = this.messages.value;
                const updatedMessages = currentMessages.map(msg => {
                    if (msg.id === userMessageId) {
                        return {
                            ...msg,
                            text: response.text ? `🎤 ${response.text}` : '🎤 (Voice input)'
                        };
                    }
                    if (msg.id === botMessageId) {
                        return {
                            ...msg,
                            text: response.text || this.generateBotResponse(response),
                            isProcessing: false
                        };
                    }
                    return msg;
                });
                this.messages.next(updatedMessages);

                // Process money transfer intent locally if detected
                if (response.intent === 'send_money' && this.authService.isAuthenticated) {
                    if (response.entities && response.entities['amount'] && response.entities['recipient']) {
                        const amount = parseFloat(response.entities['amount'].toString());
                        const recipient = response.entities['recipient'].toString();

                        // Save pending transaction details
                        this.pendingTransaction = {
                            amount: amount,
                            currency: response.entities['currency']?.toString() || 'USD',
                            recipient: recipient
                        };

                        // Process locally with balance check and recipient validation
                        this.processMoneyTransferIntent(amount, recipient, botMessageId).subscribe();
                    }
                }
            })
        );
    }

    private generateBotResponse(command: BotCommand): string {
        // Convert intent and entities into human-readable response
        if (command.intent === 'unknown') {
            return 'I\'m not sure I understand. Could you rephrase or tell me if you want to send money, check rates, or manage recipients?';
        }

        switch (command.intent) {
            case 'greeting':
                return 'Hello! How can I help you with your money transfer today?';

            case 'send_money':
                const amount = command.entities['amount'] || 'some money';
                const currency = command.entities['currency'] || 'USD';
                const recipient = command.entities['recipient'] || 'someone';
                return `I'll help you send ${amount} ${currency} to ${recipient}. Would you like to proceed?`;

            case 'check_rates':
                const fromCurrency = command.entities['fromCurrency'] || 'USD';
                const toCurrency = command.entities['toCurrency'] || 'EUR';
                return `Let me check the current exchange rate from ${fromCurrency} to ${toCurrency} for you.`;

            case 'check_balance':
                if (!this.authService.isAuthenticated) {
                    return 'You need to log in to check your balance.';
                }

                if (this.userBalance) {
                    return `Your current balance is ${this.userBalance.balance} ${this.userBalance.currency}.`;
                } else {
                    return 'I\'m retrieving your balance, please wait a moment...';
                }

            case 'help':
                return 'I can help you send money, check exchange rates, manage recipients, and track transactions. What would you like to do?';

            default:
                return `I understand you want to ${command.intent.replace('_', ' ')}. How can I help with that?`;
        }
    }

    clearChat(): void {
        this.messages.next([]);
        this.addMessage({
            id: uuidv4(),
            text: 'Chat history cleared. How can I help you today?',
            sender: MessageSender.BOT,
            timestamp: new Date()
        });
    }

    // Method to get the pending transaction info
    getPendingTransaction() {
        return { ...this.pendingTransaction };
    }

    // Method to clear the pending transaction info
    clearPendingTransaction() {
        this.pendingTransaction = {};
    }
}