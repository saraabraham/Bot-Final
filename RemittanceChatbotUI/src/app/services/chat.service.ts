// chat.service.ts
import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, tap, map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, MessageSender, BotCommand } from '../models/message.model';
import { environment } from '../../environments/environment';
import { isPlatformBrowser } from '@angular/common';
import { RemittanceService, UserBalance } from './remittance.service';
import { Recipient } from '../models/remittance.model';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';

// Define conversation state interface
export interface ConversationState {
    flow?: 'send_money' | 'deposit' | 'check_rates' | 'check_balance';
    step?: string;
    recipientExists?: boolean;
    recipientComplete?: boolean;
    collectingField?: string;
    tempRecipient?: {
        name?: string;
        accountNumber?: string;
        bankName?: string;
        country?: string;
        email?: string;
        phoneNumber?: string;
        id?: string;
    };
    transactionDetails?: {
        amount?: number;
        currency?: string;
        paymentMethod?: string;
    };
    completed?: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class ChatService {
    private messages = new BehaviorSubject<ChatMessage[]>([]);
    public messages$ = this.messages.asObservable();

    private apiUrl = `${environment.apiUrl}/chat`;
    private isBrowser: boolean;
    private localStorageKey = 'chat_messages';
    private maxStoredMessages = 50;

    private userBalance: UserBalance | null = null;
    private cachedRecipients: Recipient[] = [];

    // Enhanced conversation state
    private conversationState = new BehaviorSubject<ConversationState>({});
    public conversationState$ = this.conversationState.asObservable();

    constructor(
        private http: HttpClient,
        private remittanceService: RemittanceService,
        private authService: AuthService,
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        this.isBrowser = isPlatformBrowser(this.platformId);

        // Load messages from localStorage if available
        this.loadMessagesFromStorage();

        // If no messages were loaded, initialize with welcome message
        if (this.messages.value.length === 0) {
            this.addMessage({
                id: uuidv4(),
                text: 'Welcome to our remittance chatbot! How can I help you today? You can send money, deposit funds, check rates, check your balance, or manage recipients.',
                sender: MessageSender.BOT,
                timestamp: new Date()
            });
        } else {
            // Deduplicate any messages that might be duplicates
            this.deduplicateMessages();
        }

        // Load chat history from server if user is authenticated
        this.loadChatHistory();

        // Load user balance if authenticated
        if (this.authService.isAuthenticated) {
            this.loadUserBalance();
            this.loadRecipients();
        }

        // Subscribe to authentication changes
        this.authService.currentUser$.subscribe(user => {
            if (user?.isAuthenticated) {
                this.loadUserBalance();
                this.loadRecipients();
            } else {
                this.userBalance = null;
                this.cachedRecipients = [];
            }
        });
    }

    // Load recipients into cache
    private loadRecipients(): void {
        if (!this.authService.isAuthenticated) return;

        this.remittanceService.getSavedRecipients().subscribe({
            next: (recipients) => {
                this.cachedRecipients = recipients;
                console.log('Recipients loaded to cache:', recipients.length);
            },
            error: (error) => {
                console.error('Error loading recipients to cache:', error);
            }
        });
    }

    // Load messages from localStorage
    private loadMessagesFromStorage(): void {
        if (!this.isBrowser) return;

        try {
            const storedMessages = localStorage.getItem(this.localStorageKey);
            if (storedMessages) {
                const parsedMessages = JSON.parse(storedMessages);

                // Convert string dates back to Date objects
                const messages = parsedMessages.map((msg: any) => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }));

                this.messages.next(messages);
                console.log('Loaded messages from storage:', messages.length);
            }
        } catch (error) {
            console.error('Error loading messages from localStorage:', error);
        }
    }

    private deduplicateMessages(): void {
        const currentMessages = this.messages.value;
        if (currentMessages.length <= 1) return;

        // Look for duplicate bot messages (messages with same text close to each other)
        const deduplicatedMessages: ChatMessage[] = [];
        const recentMessages: string[] = [];

        for (const message of currentMessages) {
            const key = `${message.text}-${message.sender}`;

            // If this exact message is in the recent history, skip it
            if (recentMessages.includes(key)) {
                console.log('Skipping duplicate message:', message.text);
                continue;
            }

            // Add to deduplicated list
            deduplicatedMessages.push(message);

            // Update recent messages (keep only last 3)
            recentMessages.push(key);
            if (recentMessages.length > 3) {
                recentMessages.shift();
            }
        }

        // Only update if we actually removed duplicates
        if (deduplicatedMessages.length < currentMessages.length) {
            console.log(`Removed ${currentMessages.length - deduplicatedMessages.length} duplicate messages`);
            this.messages.next(deduplicatedMessages);
            this.saveMessagesToStorage(deduplicatedMessages);
        }
    }

    // Save messages to localStorage
    private saveMessagesToStorage(messages: ChatMessage[]): void {
        if (!this.isBrowser) return;

        try {
            // Filter out any temporary messages (like listening indicators)
            const messagesToStore = messages
                .filter(msg => !msg.isProcessing) // Don't store processing/typing messages
                .slice(-this.maxStoredMessages); // Limit the number of messages stored

            localStorage.setItem(this.localStorageKey, JSON.stringify(messagesToStore));
        } catch (error) {
            console.error('Error saving messages to localStorage:', error);
        }
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

        // Only load server history if we don't have any messages yet
        if (this.messages.value.length > 0) return;

        this.http.get<ChatMessage[]>(`${this.apiUrl}/history`)
            .subscribe({
                next: (history) => {
                    if (history && history.length > 0) {
                        // Replace our welcome message with the actual history
                        const convertedMessages = history.map(msg => ({
                            ...msg,
                            timestamp: new Date(msg.timestamp), // Convert string dates to Date objects
                            sender: msg.sender === 'user' ? MessageSender.USER : MessageSender.BOT
                        }));

                        this.messages.next(convertedMessages);

                        // Save to localStorage as well
                        this.saveMessagesToStorage(convertedMessages);
                    }
                },
                error: (error) => {
                    console.error('Error loading chat history:', error);
                }
            });
    }

    public addMessage(message: ChatMessage): void {
        const currentMessages = this.messages.value;
        const updatedMessages = [...currentMessages, message];

        this.messages.next(updatedMessages);

        // Save to localStorage (only if it's not a temporary message)
        if (!message.isProcessing) {
            this.saveMessagesToStorage(updatedMessages);
        }
    }

    // Update bot message by ID
    public updateBotMessage(messageId: string, text: string): void {
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

        // Save the updated messages to localStorage
        this.saveMessagesToStorage(updatedMessages);
    }

    // Enhanced conversation state management
    public getConversationState(): ConversationState {
        return this.conversationState.value;
    }

    public setConversationState(state: Partial<ConversationState>): void {
        const currentState = this.conversationState.value;
        this.conversationState.next({ ...currentState, ...state });
    }

    public clearConversationState(): void {
        this.conversationState.next({});
    }

    // Add clear chat method
    public clearChat(): void {
        // Reset messages to just the welcome message
        const welcomeMessage: ChatMessage = {
            id: uuidv4(),
            text: 'Welcome to our remittance chatbot! How can I help you today? You can send money, deposit funds, check rates, check your balance, or manage recipients.',
            sender: MessageSender.BOT,
            timestamp: new Date()
        };

        this.messages.next([welcomeMessage]);
        this.saveMessagesToStorage([welcomeMessage]);

        // Clear conversation state
        this.clearConversationState();
    }

    // Method to add a user message and a loading message from the bot
    private addUserMessageAndBotLoading(text: string): { userMessageId: string, botMessageId: string } {
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

        return { userMessageId, botMessageId };
    }

    // Main method to process user messages
    public sendMessage(text: string): Observable<BotCommand> {
        console.log('Processing user message:', text);

        // Add user message and bot loading message
        const { userMessageId, botMessageId } = this.addUserMessageAndBotLoading(text);

        // First check for partial/incomplete commands
        const trimmedText = text.trim().toLowerCase();

        // Check if we're in the middle of a conversation flow
        const currentState = this.getConversationState();

        // Handle cancel commands first
        if (trimmedText.includes('cancel') && currentState.flow) {
            return this.processCancelCommand(botMessageId);
        }

        // If we're collecting a field in an active flow, process it
        if (currentState.flow && currentState.collectingField &&
            !trimmedText.includes('cancel')) {
            return this.processOngoingConversation(text, botMessageId);
        }

        // IMPORTANT: Special handling for generic/incomplete commands
        // These should start a conversation flow rather than being treated as complete commands
        if (this.isGenericCommand(trimmedText)) {
            return this.processGenericCommand(trimmedText, botMessageId);
        }

        // Process specific "send money" commands with recipient/amount details
        if (this.isSpecificSendMoneyCommand(text)) {
            return this.processSendMoneyCommand(text, botMessageId);
        }

        // Process "deposit" command
        if (this.isDepositCommand(text) && this.authService.isAuthenticated) {
            return this.processDepositCommand(text, botMessageId);
        }

        // Process "check balance" command
        if (this.isCheckBalanceCommand(text) && this.authService.isAuthenticated) {
            return this.processCheckBalanceCommand(botMessageId);
        }

        // Default handling with backend for all other messages
        return this.sendToBackend(text, botMessageId);
    }

    // New helper method to detect generic/incomplete commands
    private isGenericCommand(text: string): boolean {
        const commandPatterns = [
            /^send$/i,
            /^send money$/i,
            /^transfer$/i,
            /^transfer money$/i,
            /^pay$/i,
            /^remit$/i,
            /^remit money$/i
        ];

        return commandPatterns.some(pattern => pattern.test(text));
    }

    // New method to handle generic commands
    private processGenericCommand(text: string, botMessageId: string): Observable<BotCommand> {
        console.log('Processing generic command:', text);

        // Determine which type of generic command it is
        if (text.includes('money') ||
            text.includes('send') ||
            text.includes('transfer') ||
            text.includes('remit') ||
            text.includes('pay')) {

            // It's a money sending intent
            const askRecipientText = "I'll help you send money. Who would you like to send money to?";
            this.updateBotMessage(botMessageId, askRecipientText);

            // Start the send money flow
            this.setConversationState({
                flow: 'send_money',
                collectingField: 'recipient_name'
            });

            return of({
                intent: 'send_money',
                entities: {},
                confidence: 0.9,
                text: askRecipientText
            });
        }

        // For other generic commands, send to backend
        return this.sendToBackend(text, botMessageId);
    }
    // Enhanced method to detect only specific and complete send money commands
    private isSpecificSendMoneyCommand(text: string): boolean {
        const lowercaseText = text.toLowerCase();

        // Only match patterns that clearly include both action and recipient
        // These patterns require either "to" or amount + name syntax
        return (
            lowercaseText.match(/send .+ to .+/) !== null ||
            lowercaseText.match(/transfer .+ to .+/) !== null ||
            lowercaseText.match(/pay .+ to .+/) !== null ||
            // Pattern for commands with recipient first then amount (must have digits)
            lowercaseText.match(/send [a-z\s]+ \$?[0-9]+/) !== null ||
            lowercaseText.match(/pay [a-z\s]+ \$?[0-9]+/) !== null
        );
    }


    // Detect "send money" commands
    private isSendMoneyCommand(text: string): boolean {
        const lowercaseText = text.toLowerCase().trim();

        // First check for generic command patterns that shouldn't trigger immediate processing
        if (lowercaseText === 'send money' ||
            lowercaseText === 'transfer money' ||
            lowercaseText === 'remit money' ||
            lowercaseText === 'send' ||
            lowercaseText === 'transfer') {
            return false; // Let the backend handle these generic intents
        }

        // Only trigger our custom handling for more specific commands
        return (
            lowercaseText.match(/send .+ to .+/) !== null ||
            lowercaseText.match(/transfer .+ to .+/) !== null ||
            lowercaseText.match(/pay .+ to .+/) !== null ||
            // Pattern for commands with recipient first then amount
            lowercaseText.match(/send [a-z\s]+ \$?[0-9]+/) !== null ||
            lowercaseText.match(/pay [a-z\s]+ \$?[0-9]+/) !== null
        );
    }


    // Detect "deposit" commands
    private isDepositCommand(text: string): boolean {
        const lowercaseText = text.toLowerCase();
        return (
            lowercaseText.includes('deposit') ||
            lowercaseText.includes('add money') ||
            lowercaseText.includes('add funds') ||
            lowercaseText.includes('top up')
        );
    }

    // Detect "check balance" commands
    private isCheckBalanceCommand(text: string): boolean {
        const lowercaseText = text.toLowerCase();
        return (
            lowercaseText.includes('balance') ||
            lowercaseText.includes('check balance') ||
            lowercaseText.includes('my funds') ||
            lowercaseText.includes('how much money do i have')
        );
    }

    // Process ongoing conversation in a flow
    private processOngoingConversation(text: string, botMessageId: string): Observable<BotCommand> {
        const state = this.getConversationState();

        if (state.flow === 'send_money') {
            return this.processSendMoneyFlow(text, botMessageId, state);
        } else if (state.flow === 'deposit') {
            return this.processDepositFlow(text, botMessageId, state);
        }

        // Default response if flow isn't recognized
        const responseText = "I'm not sure what we were discussing. How can I help you today?";
        this.updateBotMessage(botMessageId, responseText);
        this.clearConversationState();

        return of({
            intent: 'unknown',
            entities: {},
            confidence: 0,
            text: responseText
        });
    }

    // Process "send money" command
    private processSendMoneyCommand(text: string, botMessageId: string): Observable<BotCommand> {
        console.log('Processing send money command:', text);

        // Improved regex pattern to extract recipient and amount from various command formats
        // This pattern can detect commands like:
        // - send $10 to Alicia
        // - send 10 dollars to Alicia
        // - transfer $10 to Alicia
        // - pay Alicia $10
        // - send 10 EUR to Alicia
        const genericCommandMatch = /^(?:send|transfer|remit)\s+money$/i.test(text.trim());

        if (genericCommandMatch) {
            console.log('Detected generic send money command');
            const askRecipientText = "I'll help you send money. Who would you like to send money to?";
            this.updateBotMessage(botMessageId, askRecipientText);

            // Start the send money flow, asking for recipient
            this.setConversationState({
                flow: 'send_money',
                collectingField: 'recipient_name'
            });

            return of({
                intent: 'send_money',
                entities: {},
                confidence: 0.9,
                text: askRecipientText
            });
        }
        // Continue with the existing logic for detailed commands
        // Improved regex pattern to extract recipient and amount from various command formats
        const sendMoneyMatch = text.match(/(?:send|transfer|remit|pay)(?:\s+(?:\$?\s*)?([0-9,.]+))?(?:\s*(?:dollars|euros?|pounds?|usd|eur|gbp))?(?:\s+(?:to|for)\s+)([a-z\s]+)(?:\s+\$?([0-9,.]+))?/i);

        // Also check for alternative format: "send Alicia $10" or "pay Alicia 10 euros"
        const alternateSendMatch = text.match(/(?:send|transfer|remit|pay)\s+(?!money)([a-z\s]+)\s+\$?([0-9,.]+)(?:\s*(?:dollars|euros?|pounds?|usd|eur|gbp))?/i);

        let recipientName = '';
        let amount = 0;
        let currency = 'USD'; // Default currency

        // Try to extract currency from the command
        const currencyMatch = text.toLowerCase().match(/(?:dollars|usd|euros?|eur|pounds?|gbp|rupees?|inr)/);
        if (currencyMatch) {
            switch (currencyMatch[0]) {
                case 'dollars':
                case 'usd':
                    currency = 'USD';
                    break;
                case 'euro':
                case 'euros':
                case 'eur':
                    currency = 'EUR';
                    break;
                case 'pound':
                case 'pounds':
                case 'gbp':
                    currency = 'GBP';
                    break;
                case 'rupee':
                case 'rupees':
                case 'inr':
                    currency = 'INR';
                    break;
                // Add more currencies as needed
            }
        }

        // Extract recipient and amount from first pattern
        if (sendMoneyMatch) {
            // Try to extract recipient name
            recipientName = sendMoneyMatch[2] ? sendMoneyMatch[2].trim() : '';

            // Try to extract amount - could be in position 1 or 3
            const amountStr = sendMoneyMatch[1] || sendMoneyMatch[3];
            if (amountStr) {
                amount = parseFloat(amountStr.replace(/,/g, ''));
            }
        }
        // Try alternate pattern if first one didn't work
        else if (alternateSendMatch) {
            recipientName = alternateSendMatch[1] ? alternateSendMatch[1].trim() : '';

            // Extract amount
            const amountStr = alternateSendMatch[2];
            if (amountStr) {
                amount = parseFloat(amountStr.replace(/,/g, ''));
            }
        }

        console.log(`Extracted: Recipient=${recipientName}, Amount=${amount}, Currency=${currency}`);

        // If we couldn't extract a recipient, ask for one
        if (!recipientName) {
            const askRecipientText = "I'll help you send money. Who would you like to send money to?";
            this.updateBotMessage(botMessageId, askRecipientText);

            // Start the send money flow
            this.setConversationState({
                flow: 'send_money',
                collectingField: 'recipient_name',
                transactionDetails: amount > 0 ? { amount, currency } : {}
            });

            return of({
                intent: 'send_money',
                entities: {},
                confidence: 0.9,
                text: askRecipientText
            });
        }

        // *** Enhanced recipient matching ***
        // First try exact match
        let existingRecipient = this.findRecipientByName(recipientName);

        // If no exact match, try fuzzy matching (same as findRecipientByName but case-insensitive)
        if (!existingRecipient) {
            // Make sure we have recipients loaded
            if (this.cachedRecipients && this.cachedRecipients.length > 0) {
                console.log('Attempting fuzzy match for recipient:', recipientName);

                // Try case-insensitive matching
                const normalizedName = recipientName.toLowerCase().trim();

                // Log all cached recipients for debugging
                console.log('Available recipients:', this.cachedRecipients.map(r => r.name));

                // Try partial matching (recipient name contains the input or vice versa)
                const matchedRecipient = this.cachedRecipients.find(r =>
                    r.name.toLowerCase().includes(normalizedName) ||
                    normalizedName.includes(r.name.toLowerCase())
                );
                existingRecipient = matchedRecipient || null; // Convert undefined to null

                if (existingRecipient) {
                    console.log('Found recipient via fuzzy matching:', existingRecipient.name);
                }
            }
        }

        if (existingRecipient) {
            // We found the recipient in saved recipients
            let responseText: string;

            if (amount > 0) {
                responseText = `I found ${existingRecipient.name} in your saved recipients. You want to send ${amount} ${currency}. Is that correct?`;

                // Set up conversation state with all collected details
                this.setConversationState({
                    flow: 'send_money',
                    tempRecipient: {
                        name: existingRecipient.name,
                        id: existingRecipient.id,
                        accountNumber: existingRecipient.accountNumber || '',
                        bankName: existingRecipient.bankName || '',
                        country: existingRecipient.country || '',
                        email: existingRecipient.email || '',
                        phoneNumber: existingRecipient.phoneNumber || ''
                    },
                    recipientExists: true,
                    recipientComplete: this.isRecipientComplete(existingRecipient),
                    transactionDetails: { amount, currency },
                    collectingField: 'confirmation'
                });
            } else {
                responseText = `I found ${existingRecipient.name} in your saved recipients. How much would you like to send to ${existingRecipient.name}?`;

                // Set up conversation state to collect amount
                this.setConversationState({
                    flow: 'send_money',
                    tempRecipient: {
                        name: existingRecipient.name,
                        id: existingRecipient.id,
                        accountNumber: existingRecipient.accountNumber || '',
                        bankName: existingRecipient.bankName || '',
                        country: existingRecipient.country || '',
                        email: existingRecipient.email || '',
                        phoneNumber: existingRecipient.phoneNumber || ''
                    },
                    recipientExists: true,
                    recipientComplete: this.isRecipientComplete(existingRecipient),
                    collectingField: 'amount'
                });
            }

            this.updateBotMessage(botMessageId, responseText);

            return of({
                intent: 'send_money',
                entities: {
                    recipient: existingRecipient.name,
                    recipientExists: true,
                    amount: amount > 0 ? amount : undefined,
                    currency: currency
                },
                confidence: 0.9,
                text: responseText
            });
        } else {
            // Recipient doesn't exist, start adding a new one
            let responseText: string;

            if (amount > 0) {
                responseText = `I'll add ${recipientName} as a new recipient. You want to send ${amount} ${currency}. First, what is ${recipientName}'s account number?`;

                // Set up conversation state with amount and to collect account number
                this.setConversationState({
                    flow: 'send_money',
                    tempRecipient: { name: recipientName },
                    recipientExists: false,
                    transactionDetails: { amount, currency },
                    collectingField: 'account_number'
                });
            } else {
                responseText = `I'll add ${recipientName} as a new recipient. What is ${recipientName}'s account number?`;

                // Set up conversation state to collect account number
                this.setConversationState({
                    flow: 'send_money',
                    tempRecipient: { name: recipientName },
                    recipientExists: false,
                    collectingField: 'account_number'
                });
            }

            this.updateBotMessage(botMessageId, responseText);

            return of({
                intent: 'send_money',
                entities: {
                    recipient: recipientName,
                    recipientExists: false,
                    amount: amount > 0 ? amount : undefined,
                    currency: currency
                },
                confidence: 0.9,
                text: responseText
            });
        }
    }

    private findRecipientByName(name: string): Recipient | null {
        if (!name || !this.cachedRecipients || !this.cachedRecipients.length) return null;

        console.log(`Searching for recipient: "${name}" among ${this.cachedRecipients.length} recipients`);

        // First try exact match
        const exactMatch = this.cachedRecipients.find(r =>
            r.name === name
        );

        if (exactMatch) {
            console.log("Found exact match:", exactMatch.name);
            return exactMatch;
        }

        // Then try case-insensitive match
        const normalizedName = name.toLowerCase().trim();
        const caseInsensitiveMatch = this.cachedRecipients.find(r =>
            r.name.toLowerCase().trim() === normalizedName
        );

        if (caseInsensitiveMatch) {
            console.log("Found case-insensitive match:", caseInsensitiveMatch.name);
            return caseInsensitiveMatch;
        }

        // Try partial matching (recipient name contains the input or vice versa)
        const partialMatch = this.cachedRecipients.find(r =>
            r.name.toLowerCase().includes(normalizedName) ||
            normalizedName.includes(r.name.toLowerCase())
        );

        if (partialMatch) {
            console.log("Found partial match:", partialMatch.name);
            return partialMatch;
        }

        // If still not found, log all recipients for debugging
        console.log("No match found. Available recipients:",
            this.cachedRecipients.map(r => r.name));

        return null; // Explicitly return null instead of undefined
    }
    // Process "deposit" command
    private processDepositCommand(text: string, botMessageId: string): Observable<BotCommand> {
        // Try to extract amount from the deposit command
        const depositMatch = text.match(/(?:deposit|add|top\s+up)(?:\s+(?:\$?\s*)?([\d,.]+))?(?:\s*(?:dollars|euros?|pounds?|usd|eur|gbp))?/i);

        let amount = 0;

        if (depositMatch && depositMatch[1]) {
            // Extract amount if available
            amount = parseFloat(depositMatch[1].replace(/,/g, ''));
        }

        // If we couldn't extract an amount, ask for one
        if (amount <= 0) {
            const askAmountText = "I'll help you deposit money. How much would you like to deposit?";
            this.updateBotMessage(botMessageId, askAmountText);

            // Start the deposit flow
            this.setConversationState({
                flow: 'deposit',
                collectingField: 'amount'
            });

            return of({
                intent: 'deposit',
                entities: {},
                confidence: 0.9,
                text: askAmountText
            });
        } else {
            // We have an amount, ask for currency
            const askCurrencyText = `I'll help you deposit ${amount}. What currency would you like to use? (Default is USD)`;
            this.updateBotMessage(botMessageId, askCurrencyText);

            // Set up conversation state to collect currency
            this.setConversationState({
                flow: 'deposit',
                transactionDetails: { amount },
                collectingField: 'currency'
            });

            return of({
                intent: 'deposit',
                entities: {
                    amount: amount
                },
                confidence: 0.9,
                text: askCurrencyText
            });
        }
    }

    // Process "check balance" command
    private processCheckBalanceCommand(botMessageId: string): Observable<BotCommand> {
        // If we don't have the balance, fetch it
        if (!this.userBalance) {
            this.updateBotMessage(botMessageId, "Let me check your balance...");

            return this.remittanceService.getUserBalance().pipe(
                tap(balance => {
                    this.userBalance = balance;
                    const balanceText = `Your current balance is ${balance.balance} ${balance.currency}.`;
                    this.updateBotMessage(botMessageId, balanceText);
                }),
                map(balance => ({
                    intent: 'check_balance',
                    entities: {
                        balance: balance.balance,
                        currency: balance.currency
                    },
                    confidence: 1.0,
                    text: `Your current balance is ${balance.balance} ${balance.currency}.`
                })),
                catchError(error => {
                    console.error('Error fetching balance:', error);
                    const errorText = "I'm sorry, I couldn't retrieve your balance right now. Please try again later.";
                    this.updateBotMessage(botMessageId, errorText);
                    return of({
                        intent: 'check_balance',
                        entities: {},
                        confidence: 0.5,
                        text: errorText
                    });
                })
            );
        } else {
            // We already have the balance
            const balanceText = `Your current balance is ${this.userBalance.balance} ${this.userBalance.currency}.`;
            this.updateBotMessage(botMessageId, balanceText);

            return of({
                intent: 'check_balance',
                entities: {
                    balance: this.userBalance.balance,
                    currency: this.userBalance.currency
                },
                confidence: 1.0,
                text: balanceText
            });
        }
    }

    // Process cancel command
    private processCancelCommand(botMessageId: string): Observable<BotCommand> {
        const cancelText = "I've cancelled the current operation. Is there anything else I can help you with?";
        this.updateBotMessage(botMessageId, cancelText);

        // Clear conversation state
        this.clearConversationState();

        return of({
            intent: 'cancel',
            entities: {},
            confidence: 1.0,
            text: cancelText
        });
    }

    // Process the "send money" flow
    private processSendMoneyFlow(userInput: string, botMessageId: string, currentState: ConversationState): Observable<BotCommand> {
        // Get the current field we're collecting
        const field = currentState.collectingField;
        const tempRecipient = currentState.tempRecipient || {};
        const transactionDetails = currentState.transactionDetails || {};

        // Update the state based on which field we're collecting
        switch (field) {
            case 'recipient_name':
                // Collecting recipient name
                // Check if this recipient exists in saved recipients
                const recipientName = userInput.trim();

                // Check if recipient exists in our cache
                const existingRecipient = this.findRecipientByName(recipientName);

                if (existingRecipient) {
                    // Recipient exists
                    const responseText = `I found ${recipientName} in your saved recipients. How much would you like to send to ${recipientName}?`;
                    this.updateBotMessage(botMessageId, responseText);

                    // Update conversation state
                    this.setConversationState({
                        tempRecipient: {
                            ...tempRecipient,
                            name: recipientName,
                            id: existingRecipient.id,
                            accountNumber: existingRecipient.accountNumber || '',
                            bankName: existingRecipient.bankName || '',
                            country: existingRecipient.country || '',
                            email: existingRecipient.email || '',
                            phoneNumber: existingRecipient.phoneNumber || ''
                        },
                        recipientExists: true,
                        recipientComplete: this.isRecipientComplete(existingRecipient),
                        collectingField: 'amount'
                    });

                    return of({
                        intent: 'send_money',
                        entities: {
                            recipient: recipientName,
                            recipientExists: true
                        },
                        confidence: 0.9,
                        text: responseText
                    });
                } else {
                    // New recipient
                    const responseText = `I'll add ${recipientName} as a new recipient. What is ${recipientName}'s account number?`;
                    this.updateBotMessage(botMessageId, responseText);

                    // Update conversation state
                    this.setConversationState({
                        tempRecipient: {
                            ...tempRecipient,
                            name: recipientName
                        },
                        recipientExists: false,
                        collectingField: 'account_number'
                    });

                    return of({
                        intent: 'send_money',
                        entities: {
                            recipient: recipientName,
                            recipientExists: false
                        },
                        confidence: 0.9,
                        text: responseText
                    });
                }

            case 'account_number':
                // Collecting account number for new recipient
                const accountNumber = userInput.trim();
                const responseText = `Got it. What is the name of ${tempRecipient.name}'s bank?`;
                this.updateBotMessage(botMessageId, responseText);

                // Update conversation state
                this.setConversationState({
                    tempRecipient: {
                        ...tempRecipient,
                        accountNumber: accountNumber
                    },
                    collectingField: 'bank_name'
                });

                return of({
                    intent: 'send_money',
                    entities: {
                        recipient: tempRecipient.name,
                        accountNumber: accountNumber
                    },
                    confidence: 0.9,
                    text: responseText
                });

            case 'bank_name':
                // Collecting bank name for new recipient
                const bankName = userInput.trim();
                const countryPrompt = `Got it. In which country is ${tempRecipient.name} located?`;
                this.updateBotMessage(botMessageId, countryPrompt);

                // Update conversation state
                this.setConversationState({
                    tempRecipient: {
                        ...tempRecipient,
                        bankName: bankName
                    },
                    collectingField: 'country'
                });

                return of({
                    intent: 'send_money',
                    entities: {
                        recipient: tempRecipient.name,
                        bankName: bankName
                    },
                    confidence: 0.9,
                    text: countryPrompt
                });

            case 'country':
                // Collecting country for new recipient
                const country = userInput.trim();
                const emailPrompt = `Got it. What is ${tempRecipient.name}'s email address? (You can say "skip" if you don't want to provide this)`;
                this.updateBotMessage(botMessageId, emailPrompt);

                // Update conversation state
                this.setConversationState({
                    tempRecipient: {
                        ...tempRecipient,
                        country: country
                    },
                    collectingField: 'email'
                });

                return of({
                    intent: 'send_money',
                    entities: {
                        recipient: tempRecipient.name,
                        country: country
                    },
                    confidence: 0.9,
                    text: emailPrompt
                });

            case 'email':
                // Collecting email (optional) for new recipient
                let email = userInput.trim();

                // Check if user wants to skip
                if (email.toLowerCase() === 'skip') {
                    email = '';
                }

                const phonePrompt = `Got it. What is ${tempRecipient.name}'s phone number? (You can say "skip" if you don't want to provide this)`;
                this.updateBotMessage(botMessageId, phonePrompt);

                // Update conversation state
                this.setConversationState({
                    tempRecipient: {
                        ...tempRecipient,
                        email: email
                    },
                    collectingField: 'phone'
                });

                return of({
                    intent: 'send_money',
                    entities: {
                        recipient: tempRecipient.name,
                        email: email
                    },
                    confidence: 0.9,
                    text: phonePrompt
                });

            case 'phone':
                // Collecting phone (optional) for new recipient
                let phoneNumber = userInput.trim();

                // Check if user wants to skip
                if (phoneNumber.toLowerCase() === 'skip') {
                    phoneNumber = '';
                }

                const phonePromptMessage = `Got it. What is ${tempRecipient.name}'s phone number? (You can say "skip" if you don't want to provide this)`;
                const amountPrompt = `Thank you for providing ${tempRecipient.name}'s details. How much would you like to send to ${tempRecipient.name}?`;
                this.updateBotMessage(botMessageId, amountPrompt);

                // Update conversation state
                this.setConversationState({
                    tempRecipient: {
                        ...tempRecipient,
                        phoneNumber: phoneNumber
                    },
                    recipientComplete: true,
                    collectingField: 'amount'
                });

                return of({
                    intent: 'send_money',
                    entities: {
                        recipient: tempRecipient.name,
                        phoneNumber: phoneNumber
                    },
                    confidence: 0.9,
                    text: amountPrompt
                });

            case 'amount':
                // Collecting amount
                // Try to parse the amount from the input
                const amountMatch = userInput.match(/\$?([\d,.]+)/);
                let amount: number;

                if (amountMatch) {
                    // Extract amount from regex match
                    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                } else {
                    // Try parsing the entire input as a number
                    amount = parseFloat(userInput.replace(/,/g, ''));
                }

                if (isNaN(amount) || amount <= 0) {
                    // Invalid amount
                    const invalidAmountText = "I couldn't understand the amount. Please enter a valid number, like 100 or $50.";
                    this.updateBotMessage(botMessageId, invalidAmountText);

                    return of({
                        intent: 'send_money',
                        entities: {},
                        confidence: 0.9,
                        text: invalidAmountText
                    });
                }

                // Valid amount, ask for currency
                const currencyPrompt = `Got it, ${amount}. What currency would you like to use? (Default is USD)`;
                this.updateBotMessage(botMessageId, currencyPrompt);

                // Update conversation state
                this.setConversationState({
                    transactionDetails: {
                        ...transactionDetails,
                        amount: amount
                    },
                    collectingField: 'currency'
                });

                return of({
                    intent: 'send_money',
                    entities: {
                        recipient: tempRecipient.name,
                        amount: amount
                    },
                    confidence: 0.9,
                    text: currencyPrompt
                });

            case 'currency':
                // Collecting currency
                let currency = userInput.trim().toUpperCase();

                // If input is empty or "default", use USD
                if (!currency || currency.toLowerCase() === 'default' || currency.toLowerCase() === 'usd') {
                    currency = 'USD';
                }

                // Standard currency codes should be 3 letters
                if (!/^[A-Z]{3}$/.test(currency)) {
                    // Try to map common currency names to codes
                    const currencyMap: { [key: string]: string } = {
                        'dollars': 'USD',
                        'dollar': 'USD',
                        'usd': 'USD',
                        'us dollars': 'USD',
                        'euros': 'EUR',
                        'euro': 'EUR',
                        'eur': 'EUR',
                        'pounds': 'GBP',
                        'pound': 'GBP',
                        'gbp': 'GBP',
                        'sterling': 'GBP'
                    };

                    currency = currencyMap[userInput.toLowerCase()] || 'USD';
                }

                const paymentMethodPrompt = `Got it, ${currency}. How would you like to pay? (Options: bank, card, wallet)`;
                this.updateBotMessage(botMessageId, paymentMethodPrompt);

                // Update conversation state
                this.setConversationState({
                    transactionDetails: {
                        ...transactionDetails,
                        currency: currency
                    },
                    collectingField: 'payment_method'
                });

                return of({
                    intent: 'send_money',
                    entities: {
                        recipient: tempRecipient.name,
                        amount: transactionDetails.amount,
                        currency: currency
                    },
                    confidence: 0.9,
                    text: paymentMethodPrompt
                });

            case 'payment_method':
                // Collecting payment method
                const paymentMethod = userInput.toLowerCase();

                // Verify valid payment method
                const validMethods = ['bank', 'card', 'wallet'];
                let method = paymentMethod;

                if (!validMethods.includes(paymentMethod)) {
                    // Try to map common payment terms
                    if (paymentMethod.includes('bank') || paymentMethod.includes('transfer')) {
                        method = 'bank';
                    } else if (paymentMethod.includes('card') || paymentMethod.includes('credit') || paymentMethod.includes('debit')) {
                        method = 'card';
                    } else if (paymentMethod.includes('wallet') || paymentMethod.includes('digital') || paymentMethod.includes('paypal')) {
                        method = 'wallet';
                    } else {
                        // Default to bank
                        method = 'bank';
                    }
                }

                // Prepare for confirmation
                const confirmationPrompt = this.generateTransactionSummary(tempRecipient, transactionDetails, method);
                this.updateBotMessage(botMessageId, confirmationPrompt);

                // Update conversation state
                this.setConversationState({
                    transactionDetails: {
                        ...transactionDetails,
                        paymentMethod: method
                    },
                    collectingField: 'confirmation',
                    completed: false
                });

                return of({
                    intent: 'send_money',
                    entities: {
                        recipient: tempRecipient.name,
                        amount: transactionDetails.amount,
                        currency: transactionDetails.currency,
                        paymentMethod: method
                    },
                    confidence: 0.9,
                    text: confirmationPrompt
                });

            case 'confirmation':
                // Process confirmation
                const confirmation = userInput.toLowerCase();

                if (confirmation.includes('yes') || confirmation.includes('confirm') || confirmation.includes('proceed') || confirmation.includes('ok')) {
                    // User confirmed the transaction
                    const processingText = "Great! I'm preparing your transaction. You'll be redirected to the transaction form with all your details filled in.";
                    this.updateBotMessage(botMessageId, processingText);

                    // Mark as completed and set up for redirect
                    this.setConversationState({
                        completed: true,
                        collectingField: undefined
                    });

                    // Redirect to the form with all details
                    setTimeout(() => {
                        this.redirectToRemittanceForm(tempRecipient, transactionDetails);
                    }, 1500);

                    return of({
                        intent: 'send_money',
                        entities: {
                            recipient: tempRecipient.name,
                            amount: transactionDetails.amount,
                            currency: transactionDetails.currency,
                            paymentMethod: transactionDetails.paymentMethod,
                            confirmed: true
                        },
                        confidence: 0.9,
                        text: processingText
                    });
                } else {
                    // User did not confirm
                    const cancelText = "Transaction cancelled. Is there anything else I can help you with?";
                    this.updateBotMessage(botMessageId, cancelText);

                    // Clear conversation state
                    this.clearConversationState();

                    return of({
                        intent: 'cancel',
                        entities: {},
                        confidence: 0.9,
                        text: cancelText
                    });
                }

            default:
                // Shouldn't get here if state is properly managed
                const errorText = "I'm sorry, I lost track of our conversation. Let's start over. How can I help you?";
                this.updateBotMessage(botMessageId, errorText);

                // Clear conversation state
                this.clearConversationState();

                return of({
                    intent: 'error',
                    entities: {},
                    confidence: 0.5,
                    text: errorText
                });
        }
    }

    // Process the "deposit" flow
    private processDepositFlow(userInput: string, botMessageId: string, currentState: ConversationState): Observable<BotCommand> {
        // Implementation similar to send money flow but for deposits
        const field = currentState.collectingField;
        const transactionDetails = currentState.transactionDetails || {};

        switch (field) {
            case 'amount':
                // Parsing amount logic similar to send money flow
                const amountMatch = userInput.match(/\$?([\d,.]+)/);
                let amount: number;

                if (amountMatch) {
                    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                } else {
                    amount = parseFloat(userInput.replace(/,/g, ''));
                }

                if (isNaN(amount) || amount <= 0) {
                    const invalidAmountText = "I couldn't understand the amount. Please enter a valid number, like 100 or $50.";
                    this.updateBotMessage(botMessageId, invalidAmountText);

                    return of({
                        intent: 'deposit',
                        entities: {},
                        confidence: 0.9,
                        text: invalidAmountText
                    });
                }

                const currencyPrompt = `Got it, ${amount}. What currency would you like to use? (Default is USD)`;
                this.updateBotMessage(botMessageId, currencyPrompt);

                this.setConversationState({
                    transactionDetails: {
                        ...transactionDetails,
                        amount: amount
                    },
                    collectingField: 'currency'
                });

                return of({
                    intent: 'deposit',
                    entities: {
                        amount: amount
                    },
                    confidence: 0.9,
                    text: currencyPrompt
                });

            case 'currency':
                // Collecting currency
                let currency = userInput.trim().toUpperCase();

                // If input is empty or "default", use USD
                if (!currency || currency.toLowerCase() === 'default' || currency.toLowerCase() === 'usd') {
                    currency = 'USD';
                }

                // Standard currency codes should be 3 letters
                if (!/^[A-Z]{3}$/.test(currency)) {
                    // Try to map common currency names to codes
                    const currencyMap: { [key: string]: string } = {
                        'dollars': 'USD',
                        'dollar': 'USD',
                        'usd': 'USD',
                        'us dollars': 'USD',
                        'euros': 'EUR',
                        'euro': 'EUR',
                        'eur': 'EUR',
                        'pounds': 'GBP',
                        'pound': 'GBP',
                        'gbp': 'GBP',
                        'sterling': 'GBP'
                    };

                    currency = currencyMap[userInput.toLowerCase()] || 'USD';
                }

                const paymentMethodPrompt = `Got it, ${currency}. How would you like to pay for the deposit? (Options: bank, card, wallet)`;
                this.updateBotMessage(botMessageId, paymentMethodPrompt);

                // Update conversation state
                this.setConversationState({
                    transactionDetails: {
                        ...transactionDetails,
                        currency: currency
                    },
                    collectingField: 'payment_method'
                });

                return of({
                    intent: 'deposit',
                    entities: {
                        amount: transactionDetails.amount,
                        currency: currency
                    },
                    confidence: 0.9,
                    text: paymentMethodPrompt
                });

            case 'payment_method':
                // Collecting payment method
                const paymentMethod = userInput.toLowerCase();

                // Verify valid payment method
                const validMethods = ['bank', 'card', 'wallet'];
                let method = paymentMethod;

                if (!validMethods.includes(paymentMethod)) {
                    // Try to map common payment terms
                    if (paymentMethod.includes('bank') || paymentMethod.includes('transfer')) {
                        method = 'bank';
                    } else if (paymentMethod.includes('card') || paymentMethod.includes('credit') || paymentMethod.includes('debit')) {
                        method = 'card';
                    } else if (paymentMethod.includes('wallet') || paymentMethod.includes('digital') || paymentMethod.includes('paypal')) {
                        method = 'wallet';
                    } else {
                        // Default to bank
                        method = 'bank';
                    }
                }

                // Generate deposit summary
                const depositSummary = this.generateDepositSummary(transactionDetails, method);
                this.updateBotMessage(botMessageId, depositSummary);

                // Update conversation state
                this.setConversationState({
                    transactionDetails: {
                        ...transactionDetails,
                        paymentMethod: method
                    },
                    collectingField: 'confirmation',
                    completed: false
                });

                return of({
                    intent: 'deposit',
                    entities: {
                        amount: transactionDetails.amount,
                        currency: transactionDetails.currency,
                        paymentMethod: method
                    },
                    confidence: 0.9,
                    text: depositSummary
                });

            case 'confirmation':
                // Process confirmation
                const confirmation = userInput.toLowerCase();

                if (confirmation.includes('yes') || confirmation.includes('confirm') || confirmation.includes('proceed') || confirmation.includes('ok')) {
                    // User confirmed the deposit
                    const processingText = "Great! I'm preparing your deposit. You'll be redirected to the deposit form with all your details filled in.";
                    this.updateBotMessage(botMessageId, processingText);

                    // Mark as completed and set up for redirect
                    this.setConversationState({
                        completed: true,
                        collectingField: undefined
                    });

                    // Redirect to the deposit form with all details
                    setTimeout(() => {
                        this.redirectToDepositForm(transactionDetails);
                    }, 1500);

                    return of({
                        intent: 'deposit',
                        entities: {
                            amount: transactionDetails.amount,
                            currency: transactionDetails.currency,
                            paymentMethod: transactionDetails.paymentMethod,
                            confirmed: true
                        },
                        confidence: 0.9,
                        text: processingText
                    });
                } else {
                    // User did not confirm
                    const cancelText = "Deposit cancelled. Is there anything else I can help you with?";
                    this.updateBotMessage(botMessageId, cancelText);

                    // Clear conversation state
                    this.clearConversationState();

                    return of({
                        intent: 'cancel',
                        entities: {},
                        confidence: 0.9,
                        text: cancelText
                    });
                }

            default:
                // Shouldn't get here if state is properly managed
                const errorText = "I'm sorry, I lost track of our conversation. Let's start over. How can I help you?";
                this.updateBotMessage(botMessageId, errorText);

                // Clear conversation state
                this.clearConversationState();

                return of({
                    intent: 'error',
                    entities: {},
                    confidence: 0.5,
                    text: errorText
                });
        }
    }

    // Send message to backend for processing
    private sendToBackend(text: string, botMessageId: string): Observable<BotCommand> {
        return this.http.post<BotCommand>(`${this.apiUrl}/message`, { text }).pipe(
            tap(response => {
                // Update messages to replace the "typing" message with the actual response
                this.updateBotMessage(botMessageId, response.text || this.generateBotResponse(response));
            }),
            catchError(error => {
                console.error('Error sending message to backend:', error);
                const errorText = "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
                this.updateBotMessage(botMessageId, errorText);
                return of({
                    intent: 'error',
                    entities: {},
                    confidence: 0,
                    text: errorText
                });
            })
        );
    }

    // Generate a transaction summary for confirmation
    private generateTransactionSummary(recipient: any, transaction: any, paymentMethod: string): string {
        const amount = transaction.amount || 0;
        const currency = transaction.currency || 'USD';

        // Add fees calculation (approximate)
        const fee = Math.max(amount * 0.01, 1); // 1% fee or minimum $1
        const total = amount + fee;

        let summary = `I'll help you send ${amount} ${currency} to ${recipient.name} using ${paymentMethod}.\n\n`;
        summary += `Transaction Summary:\n`;
        summary += `- Amount: ${amount} ${currency}\n`;
        summary += `- Recipient: ${recipient.name}\n`;
        summary += `- Fees: ${fee.toFixed(2)} ${currency}\n`;
        summary += `- Total: ${total.toFixed(2)} ${currency}\n`;
        summary += `- Payment Method: ${paymentMethod}\n\n`;

        // Add balance check if we have user balance
        if (this.userBalance) {
            const isSameCurrency = this.userBalance.currency === currency;

            if (isSameCurrency) {
                // Simple comparison if currencies match
                if (this.userBalance.balance < total) {
                    summary += `Note: Your balance of ${this.userBalance.balance} ${this.userBalance.currency} is not sufficient for this transaction.\n\n`;
                } else {
                    summary += `Your balance after this transaction will be approximately ${(this.userBalance.balance - total).toFixed(2)} ${this.userBalance.currency}.\n\n`;
                }
            } else {
                // Just a general note if currencies don't match
                summary += `Note: This transaction is in ${currency}, while your account balance is in ${this.userBalance.currency}.\n\n`;
            }
        }

        summary += `Would you like to proceed with this transaction?`;
        return summary;
    }

    // Generate a deposit summary for confirmation
    private generateDepositSummary(transaction: any, paymentMethod: string): string {
        const amount = transaction.amount || 0;
        const currency = transaction.currency || 'USD';

        let summary = `I'll help you deposit ${amount} ${currency} using ${paymentMethod}.\n\n`;
        summary += `Deposit Summary:\n`;
        summary += `- Amount: ${amount} ${currency}\n`;
        summary += `- Payment Method: ${paymentMethod}\n\n`;

        // Add current balance if available
        if (this.userBalance) {
            const isSameCurrency = this.userBalance.currency === currency;

            if (isSameCurrency) {
                summary += `Your balance after this deposit will be approximately ${(this.userBalance.balance + amount).toFixed(2)} ${this.userBalance.currency}.\n\n`;
            } else {
                summary += `Note: This deposit is in ${currency}, while your account balance is in ${this.userBalance.currency}.\n\n`;
            }
        }

        summary += `Would you like to proceed with this deposit?`;
        return summary;
    }

    // Helper method to find a recipient by name

    private async updateUserSavedRecipients(newRecipientId: string): Promise<void> {
        if (!this.authService.isAuthenticated || !newRecipientId) return;

        try {
            // First get current user info to check existing savedRecipients
            const userId = this.authService.currentUser?.id;

            // We can use the remittanceService to find the user
            // Add this recipient ID to the user's saved recipients
            // You'll need to implement this method in your backend service
            // This is a placeholder for what you need to implement
            await this.remittanceService.addRecipientToUserSaved(newRecipientId).toPromise();

            // After successfully adding, reload recipient cache
            this.loadRecipients();

            console.log(`Added recipient ${newRecipientId} to user's saved recipients`);
        } catch (error) {
            console.error("Failed to update user's saved recipients:", error);
        }
    }

    // Helper method to check if a recipient has complete details
    private isRecipientComplete(recipient: Recipient): boolean {
        return !!(
            recipient &&
            recipient.accountNumber &&
            recipient.bankName &&
            recipient.country
        );
    }

    // Generate a standard bot response from intent and entities
    private generateBotResponse(command: BotCommand): string {
        // Convert intent and entities into human-readable response
        if (command.intent === 'unknown') {
            return 'I\'m not sure I understand. Could you rephrase or tell me if you want to send money, deposit funds, check rates, or manage recipients?';
        }

        switch (command.intent) {
            case 'greeting':
                return 'Hello! How can I help you with your money transfer today?';

            case 'send_money':
                const amount = command.entities['amount'] || 'some money';
                const currency = command.entities['currency'] || 'USD';
                const recipient = command.entities['recipient'] || 'someone';
                return `I'll help you send ${amount} ${currency} to ${recipient}. Would you like to proceed?`;

            case 'deposit':
                const depositAmount = command.entities['amount'] || 'some money';
                const depositCurrency = command.entities['currency'] || 'USD';
                return `I'll help you deposit ${depositAmount} ${depositCurrency} to your account. Would you like to proceed?`;

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
                return 'I can help you send money, deposit funds, check exchange rates, manage recipients, and track transactions. What would you like to do?';

            default:
                return `I understand you want to ${command.intent.replace('_', ' ')}. How can I help with that?`;
        }
    }

    // Redirect to the remittance form with all collected details
    private redirectToRemittanceForm(recipient: any, transaction: any): void {
        // Create the query params for the redirect
        const queryParams: any = {};

        // Add transaction details
        if (transaction.amount) queryParams.amount = transaction.amount;
        if (transaction.currency) queryParams.currency = transaction.currency;
        if (transaction.paymentMethod) queryParams.paymentMethod = transaction.paymentMethod;

        // Add recipient details
        if (recipient.name) {
            queryParams.recipient = recipient.name;

            if (this.getConversationState().recipientExists && recipient.id) {
                // If recipient exists, just add the ID
                queryParams.recipientId = recipient.id;
            } else {
                // If new recipient, create new recipient and pass full details
                queryParams.newRecipient = true;

                // Store the new recipient in local storage to be picked up by the form
                if (this.isBrowser) {
                    localStorage.setItem('new_recipient', JSON.stringify({
                        name: recipient.name,
                        accountNumber: recipient.accountNumber,
                        bankName: recipient.bankName,
                        country: recipient.country,
                        email: recipient.email,
                        phoneNumber: recipient.phoneNumber
                    }));
                }
            }
        }

        // Clear conversation state before navigating
        this.clearConversationState();

        // Navigate to the remittance form
        this.router.navigate(['/send-money'], { queryParams });
    }

    // Redirect to the deposit form with all collected details
    private redirectToDepositForm(transaction: any): void {
        // Create the query params for the redirect
        const queryParams: any = {};

        // Add transaction details
        if (transaction.amount) queryParams.amount = transaction.amount;
        if (transaction.currency) queryParams.currency = transaction.currency;
        if (transaction.paymentMethod) queryParams.method = transaction.paymentMethod;

        // Clear conversation state before navigating
        this.clearConversationState();

        // Navigate to the deposit form
        this.router.navigate(['/deposit'], { queryParams });
    }

    public processVoiceInput(audioBlob: Blob): Observable<BotCommand> {
        const formData = new FormData();
        formData.append('audio', audioBlob);

        // Add a temporary bot message showing "typing" state
        const botMessageId = uuidv4();
        this.addMessage({
            id: botMessageId,
            text: 'Processing your voice input...',
            sender: MessageSender.BOT,
            timestamp: new Date(),
            isProcessing: true
        });

        return this.http.post<BotCommand>(`${this.apiUrl}/voice`, formData).pipe(
            tap(response => {
                // Update the bot message with the response
                this.updateBotMessage(botMessageId, response.text || this.generateBotResponse(response));

                // Process the intent if needed
                this.handleBotCommandIntent(response, botMessageId);
            }),
            catchError(error => {
                console.error('Error processing voice input:', error);
                const errorText = "I'm sorry, I had trouble understanding your voice input. Could you please try again or type your message?";
                this.updateBotMessage(botMessageId, errorText);
                return of({
                    intent: 'error',
                    entities: {},
                    confidence: 0,
                    text: errorText
                });
            })
        );
    }

    // Helper method to handle bot command intents that may need follow-up
    private handleBotCommandIntent(command: BotCommand, botMessageId: string): void {
        // If the command is a send money intent with recipient and amount
        if (command.intent === 'send_money' &&
            command.entities['recipient'] &&
            command.entities['amount'] &&
            this.authService.isAuthenticated) {

            const recipientName = command.entities['recipient'].toString();
            const amount = parseFloat(command.entities['amount'].toString());

            // Check if this recipient exists
            const existingRecipient = this.findRecipientByName(recipientName);

            if (existingRecipient) {
                // Start conversation flow with existing recipient
                this.setConversationState({
                    flow: 'send_money',
                    tempRecipient: {
                        name: recipientName,
                        id: existingRecipient.id,
                        accountNumber: existingRecipient.accountNumber || '',
                        bankName: existingRecipient.bankName || '',
                        country: existingRecipient.country || '',
                        email: existingRecipient.email || '',
                        phoneNumber: existingRecipient.phoneNumber || ''
                    },
                    recipientExists: true,
                    recipientComplete: this.isRecipientComplete(existingRecipient),
                    transactionDetails: { amount },
                    collectingField: 'currency'
                });

                // Update the message to ask for currency
                setTimeout(() => {
                    const followUpText = `I found ${recipientName} in your saved recipients. What currency would you like to use for this transfer? (Default is USD)`;
                    this.updateBotMessage(botMessageId, followUpText);
                }, 1000);
            } else {
                // Start conversation flow with new recipient
                this.setConversationState({
                    flow: 'send_money',
                    tempRecipient: { name: recipientName },
                    recipientExists: false,
                    transactionDetails: { amount },
                    collectingField: 'account_number'
                });

                // Update the message to ask for account number
                setTimeout(() => {
                    const followUpText = `I'll add ${recipientName} as a new recipient. What is ${recipientName}'s account number?`;
                    this.updateBotMessage(botMessageId, followUpText);
                }, 1000);
            }
        }

        // If the command is a deposit intent with amount
        else if (command.intent === 'deposit' &&
            command.entities['amount'] &&
            this.authService.isAuthenticated) {

            const amount = parseFloat(command.entities['amount'].toString());

            // Start deposit flow
            this.setConversationState({
                flow: 'deposit',
                transactionDetails: { amount },
                collectingField: 'currency'
            });

            // Update the message to ask for currency
            setTimeout(() => {
                const followUpText = `What currency would you like to use for this deposit? (Default is USD)`;
                this.updateBotMessage(botMessageId, followUpText);
            }, 1000);
        }
    }
}