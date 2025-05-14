import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { VoiceRecognitionService } from '../../services/voice-recognition.service';
import { RemittanceService } from '../../services/remittance.service';
import { ChatMessage, MessageSender, BotCommand } from '../../models/message.model';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-chat',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        DatePipe
    ],
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
    @ViewChild('chatMessages') chatMessages!: ElementRef;
    @ViewChild('messageInput') messageInput!: ElementRef<HTMLInputElement>;

    messages: ChatMessage[] = [];
    newMessage = '';
    isListening = false;
    isAuthenticated = false;
    private destroy$ = new Subject<void>();

    // Voice recognition properties
    isProcessingVoiceCommand = false;
    voiceRecognitionSupported = true;
    lastTranscript = '';
    private hasCheckedMicPermission = false;
    private hasUsedMicrophoneBefore = false;
    private currentListeningMessageId: string | null = null;
    private processedParams = new Set<string>();

    constructor(
        private chatService: ChatService,
        private voiceService: VoiceRecognitionService,
        private remittanceService: RemittanceService,
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute,
        private cdRef: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        // Clear previous subscriptions first
        this.destroy$.next();

        // Set up subscriptions
        this.initializeSubscriptions();

        // Check browser voice support
        this.checkVoiceSupport();

        // Listen for URL parameters
        this.listenForQueryParams();
    }

    ngAfterViewChecked(): void {
        this.scrollToBottom();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // Optimized subscriptions setup - consolidates all subscription logic
    private initializeSubscriptions(): void {
        // Authentication status subscription
        this.authService.currentUser$
            .pipe(takeUntil(this.destroy$))
            .subscribe(user => {
                this.isAuthenticated = !!user?.isAuthenticated;
            });

        // Chat messages subscription
        this.chatService.messages$
            .pipe(takeUntil(this.destroy$))
            .subscribe((messages: ChatMessage[]) => {
                this.messages = messages;
            });

        // Voice recognition status subscription
        this.voiceService.isListening$
            .pipe(takeUntil(this.destroy$))
            .subscribe(isListening => {
                this.isListening = isListening;

                // When stopped listening but have a transcript, just update the input field
                if (!isListening && this.lastTranscript && !this.isProcessingVoiceCommand) {
                    // Just update the input field but don't send
                    this.newMessage = this.lastTranscript;
                    this.cdRef.detectChanges();

                    // Clear the listening indicator if it exists
                    if (this.currentListeningMessageId) {
                        const currentMessages = this.messages.filter(msg =>
                            msg.id !== this.currentListeningMessageId
                        );
                        this.messages = currentMessages;
                        this.currentListeningMessageId = null;
                        this.cdRef.detectChanges();
                    }

                    // Focus on the input field
                    setTimeout(() => {
                        if (this.messageInput?.nativeElement) {
                            this.messageInput.nativeElement.focus();
                        }
                    }, 50);

                    // Clear this so it's not processed again
                    this.lastTranscript = '';
                }
            });

        // Voice transcripts subscription
        this.voiceService.transcript$
            .pipe(takeUntil(this.destroy$))
            .subscribe(transcript => {
                if (!transcript) return;

                // Set the transcript as the current value in the input field
                this.newMessage = transcript;
                this.lastTranscript = transcript;

                // Update the listening message with the transcript
                this.updateListeningMessage(transcript);

                // Automatically stop listening after getting certain commands
                if (this.shouldStopListeningForCommand(transcript)) {
                    this.stopVoiceRecognition();
                }
            });
    }


    // Check if voice recognition is supported
    private checkVoiceSupport(): void {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        this.voiceRecognitionSupported = !!SpeechRecognition;
    }

    // Listen for URL query parameters
    private listenForQueryParams(): void {
        this.route.queryParams
            .pipe(takeUntil(this.destroy$))
            .subscribe(params => {
                // Extract just the relevant parameters for deduplication
                const relevantParams = {
                    depositSuccess: params['depositSuccess'],
                    transactionSuccess: params['transactionSuccess'],
                    recipient: params['recipient'],
                    amount: params['amount'],
                    currency: params['currency']
                };

                // Check if we have any success parameters that need to trigger messages
                const hasSuccessParams =
                    relevantParams.depositSuccess === 'true' ||
                    relevantParams.transactionSuccess === 'true';

                if (!hasSuccessParams) {
                    // If there are no success params, just return - don't process anything
                    return;
                }

                // Generate a unique key for these params
                const paramKey = JSON.stringify(relevantParams);

                // Skip if we've already processed these exact parameters
                if (this.processedParams.has(paramKey)) {
                    return;
                }

                // Handle deposit success
                if (params['depositSuccess'] === 'true' && params['amount'] && params['currency']) {
                    this.addBotMessage(
                        `Your deposit of ${params['amount']} ${params['currency']} was successful! Your account has been updated.`
                    );
                    this.processedParams.add(paramKey);
                }

                // Handle send money success
                if (params['transactionSuccess'] === 'true' && params['recipient']) {
                    this.addBotMessage(
                        `Your money transfer to ${params['recipient']} was successful!`
                    );
                    this.processedParams.add(paramKey);
                }

                // Clear query params to avoid processing them again on subsequent navigations
                this.router.navigate([], {
                    relativeTo: this.route,
                    queryParams: { _t: new Date().getTime() },
                    queryParamsHandling: 'merge',
                    replaceUrl: true
                });
            });
    }
    // Optimized scroll to bottom that reduces jank
    scrollToBottom(): void {
        try {
            if (!this.chatMessages?.nativeElement) return;

            // Don't scroll if the user has manually scrolled up (indicating they're viewing history)
            const element = this.chatMessages.nativeElement;
            const isScrolledUp = element.scrollHeight - element.scrollTop - element.clientHeight > 50;

            // Only auto-scroll if user is already at the bottom (or very close)
            if (!isScrolledUp) {
                // Use requestAnimationFrame for smoother scrolling
                requestAnimationFrame(() => {
                    element.scrollTop = element.scrollHeight;
                });
            }
        } catch (err) {
            console.error('Scroll error:', err);
        }
    }

    // Add a new method that will manually scroll to bottom (for user-initiated actions)
    scrollToBottomForced(): void {
        try {
            if (!this.chatMessages?.nativeElement) return;

            // Force scroll to bottom regardless of current position
            requestAnimationFrame(() => {
                const element = this.chatMessages.nativeElement;
                element.scrollTop = element.scrollHeight;
            });
        } catch (err) {
            console.error('Forced scroll error:', err);
        }
    }


    // Optimized send message handler
    sendMessage(): void {

        if (!this.newMessage.trim()) return;

        const message = this.newMessage;
        this.newMessage = '';
        // Add user message to chat
        this.addUserMessage(message);

        // Force scroll to bottom when user sends a message
        this.scrollToBottomForced();

        // Add user message to chat
        this.addUserMessage(message);

        // Process conversation state
        const conversationState = this.chatService.getConversationState();

        // Handle recipient expectation
        if (conversationState.expectingRecipient && conversationState.pendingAction === 'send') {
            this.handleExpectedRecipient(message.trim(), conversationState);
            return;
        }

        // Handle amount expectation
        if (conversationState.expectingAmount) {
            this.handleExpectedAmount(message, conversationState);
            return;
        }

        // Check for local intents
        if (this.handleLocalIntents(message)) {
            return;
        }

        // If no local handling, send to service for processing
        this.sendMessageToService(message);
    }

    // Helper method to add user message
    private addUserMessage(text: string): string {
        const id = Math.random().toString(36).substring(7);
        const newMessage = {
            id,
            text,
            sender: MessageSender.USER,
            timestamp: new Date()
        };

        // Update messages immutably to help with change detection
        this.messages = [...this.messages, newMessage];
        this.cdRef.detectChanges();

        return id;
    }

    // Helper method to add bot message
    private addBotMessage(text: string, actions: any[] = []): string {
        const id = Math.random().toString(36).substring(7);
        const newMessage = {
            id,
            text,
            sender: MessageSender.BOT,
            timestamp: new Date(),
            actions
        };

        // Update messages immutably
        this.messages = [...this.messages, newMessage];
        this.cdRef.detectChanges();

        return id;
    }

    // Handle recipient expected in conversation flow
    private handleExpectedRecipient(recipientName: string, conversationState: any): void {
        // Clear the conversation state
        this.chatService.clearConversationState();

        // Set the pending transaction
        this.chatService.setPendingTransaction({
            amount: conversationState.partialData?.amount || 0,
            currency: conversationState.partialData?.currency || 'USD',
            recipient: recipientName
        });

        // Add bot confirmation message
        this.addBotMessage(
            `I'll help you send money to ${recipientName}. Let me take you to the send money form.`
        );

        // Navigate to send money form
        setTimeout(() => {
            this.router.navigate(['/send-money'], {
                queryParams: {
                    recipient: recipientName,
                    amount: conversationState.partialData?.amount || undefined
                }
            });
        }, 1000);
    }

    // Handle amount expected in conversation flow
    private handleExpectedAmount(message: string, conversationState: any): void {
        // Try to parse the amount from the message
        const amountMatch = message.match(/\$?(\d+(?:\.\d+)?)/);
        const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

        if (amount <= 0) {
            // If we couldn't parse a valid amount, ask again
            this.addBotMessage("I couldn't understand the amount. Please enter a valid number.");
            return;
        }

        // Handle based on pending action
        if (conversationState.pendingAction === 'send') {
            this.handleSendMoneyAmount(amount, conversationState);
        } else if (conversationState.pendingAction === 'deposit') {
            this.handleDepositAmount(amount);
        }
    }

    // Handle amount for send money flow
    private handleSendMoneyAmount(amount: number, conversationState: any): void {
        // Now ask for recipient
        this.chatService.setConversationState({
            expectingAmount: false,
            expectingRecipient: true,
            partialData: {
                ...conversationState.partialData,
                amount: amount
            }
        });

        this.addBotMessage(
            `Great! You want to send $${amount}. Who would you like to send it to?`
        );
    }

    // Handle amount for deposit flow
    private handleDepositAmount(amount: number): void {
        // Clear conversation state
        this.chatService.clearConversationState();

        // Navigate to deposit form
        this.addBotMessage(
            `I'll help you deposit $${amount} to your account. Taking you to the deposit form.`
        );

        setTimeout(() => {
            this.router.navigate(['/deposit'], {
                queryParams: {
                    amount: amount
                }
            });
        }, 1000);
    }

    // Handle local intents before sending to server
    private handleLocalIntents(message: string): boolean {
        // Add this check at the top or with the other checks
        if (this.isViewHistoryIntent(message) && this.isAuthenticated) {
            this.handleCheckStatusIntent();
            return true;
        }

        // Process deposit intent
        if (this.isDepositIntent(message) && this.isAuthenticated) {
            this.handleDepositIntent(message);
            return true;
        }

        // Process send money intent
        if (this.isSendMoneyIntent(message) && this.isAuthenticated) {
            this.handleSendMoneyIntent(message);
            return true;
        }

        // Rest of the method remains the same...

        return false;
    }

    // Intent detection methods
    private isDepositIntent(message: string): boolean {
        const lowercased = message.trim().toLowerCase();
        return lowercased === 'deposit' ||
            /(?:deposit|add\s+money|top\s+up)/.test(lowercased);
    }

    private isSendMoneyIntent(message: string): boolean {
        const lowercased = message.trim().toLowerCase();
        return lowercased === 'send money' ||
            lowercased === 'send' ||
            /(?:send|transfer|remit)/.test(lowercased);
    }

    private isCheckRatesIntent(message: string): boolean {
        const lowercased = message.trim().toLowerCase();
        return lowercased === 'check rates' ||
            lowercased === 'exchange rates' ||
            lowercased === 'rates';
    }

    private isManageRecipientsIntent(message: string): boolean {
        const lowercased = message.trim().toLowerCase();
        return lowercased === 'manage recipients' ||
            lowercased === 'recipients' ||
            lowercased === 'manage recipient';
    }

    private isCheckStatusIntent(message: string): boolean {
        const lowercased = message.trim().toLowerCase();
        return lowercased === 'check transaction status' ||
            lowercased === 'transaction status' ||
            lowercased === 'check status';
    }

    // Intent handling methods
    private handleDepositIntent(message: string): void {
        console.log('Detected deposit intent locally');

        // Extract amount if provided
        const depositMatch = message.match(/(?:deposit|add\s+money|top\s+up)(?:\s+(?:(?:\$?\s*)?(\d+(?:\.\d+)?))?(?:\s*dollars|\s*euro|\s*pound|\s*usd|\s*eur|\s*gbp)?)?/i);
        const amount = depositMatch && depositMatch[1] ?
            parseFloat(depositMatch[1].replace(/[$,]/g, '')) : 0;

        if (amount > 0) {
            // Set pending transaction details for deposit
            this.chatService.setPendingTransaction({
                amount: amount,
                currency: 'USD',
                isDeposit: true
            });

            // Add confirmation message
            this.addBotMessage(
                `I'll help you deposit $${amount} to your account. Taking you to the deposit form.`
            );

            // Redirect to deposit form after a short delay
            setTimeout(() => {
                this.router.navigate(['/deposit'], {
                    queryParams: {
                        amount: amount
                    }
                });
            }, 1000);
        } else {
            // Ask for the amount
            this.chatService.setConversationState({
                expectingAmount: true,
                pendingAction: 'deposit',
                partialData: {}
            });

            this.addBotMessage("How much would you like to deposit?");
        }
    }

    private handleSendMoneyIntent(message: string): void {
        console.log('Detected send money intent locally');

        // Extract amount and recipient
        const sendMoneyMatch = message.match(/(?:send|transfer|remit)(?:\s+(?:(?:\$?\s*)?(\d+(?:\.\d+)?))?(?:\s*dollars|\s*euro|\s*pound|\s*usd|\s*eur|\s*gbp)?(?:\s+(?:to\s+)(\w+))?)?/i);

        let amount = 0;
        let recipientName = '';

        if (sendMoneyMatch && sendMoneyMatch[1]) {
            amount = parseFloat(sendMoneyMatch[1].replace(/[$,]/g, ''));
        }

        if (sendMoneyMatch && sendMoneyMatch[2]) {
            recipientName = sendMoneyMatch[2];
        }

        // For simple commands without recipient, ask for more info
        if (message.trim().toLowerCase() === 'send money' ||
            message.trim().toLowerCase() === 'send' ||
            !recipientName) {

            // Set conversation state to expect recipient
            this.chatService.setConversationState({
                expectingRecipient: true,
                pendingAction: 'send',
                partialData: {
                    amount: amount
                }
            });

            this.addBotMessage("Who would you like to send money to?");
            return;
        }

        // If we have recipient, proceed normally
        this.chatService.setPendingTransaction({
            amount: amount,
            currency: 'USD',
            recipient: recipientName
        });

        // Add confirmation message
        this.addBotMessage(
            `I'll help you send money to ${recipientName}. Taking you to the send money form.`
        );

        // Navigate to send money form after a short delay
        setTimeout(() => {
            this.router.navigate(['/send-money'], {
                queryParams: {
                    amount: amount > 0 ? amount : undefined,
                    recipient: recipientName
                }
            });
        }, 1000);
    }

    private handleCheckRatesIntent(message: string): void {
        // Check for currency pair
        const directCurrencyPairMatch = message.match(/(\w{3})\s+(?:to|and)\s+(\w{3})/i);

        if (directCurrencyPairMatch) {
            const fromCurrency = directCurrencyPairMatch[1].toUpperCase();
            const toCurrency = directCurrencyPairMatch[2].toUpperCase();

            // Tell the user we're taking them to the exchange rates page
            this.addBotMessage(
                `I'll help you check the exchange rate from ${fromCurrency} to ${toCurrency}. Taking you to our exchange rate calculator.`
            );

            // Navigate to exchange rates form with the currencies pre-selected
            setTimeout(() => {
                this.router.navigate(['/exchange-rates'], {
                    queryParams: {
                        fromCurrency: fromCurrency,
                        toCurrency: toCurrency
                    }
                });
            }, 1000);
        } else {
            // Generic rates request
            this.addBotMessage(
                "I'll help you check exchange rates. Taking you to our exchange rate calculator."
            );

            // Navigate to exchange rates form after a short delay
            setTimeout(() => {
                this.router.navigate(['/exchange-rates']);
            }, 1000);
        }
    }

    private handleManageRecipientsIntent(): void {
        // Display recipient options
        this.addBotMessage(
            "What would you like to do with your recipients?",
            [
                {
                    text: 'View Recipients',
                    action: () => this.viewRecipients()
                },
                {
                    text: 'Add New Recipient',
                    action: () => this.addNewRecipient()
                }
            ]
        );
    }

    private handleCheckStatusIntent(): void {
        // Check auth state first
        this.checkAuth();

        // First, add a processing message
        const processingMessageId = this.addBotMessage("Checking your transaction history...");

        // Force scroll to bottom for this message
        this.scrollToBottomForced();

        console.log('Auth state when retrieving transactions:', this.isAuthenticated);
        console.log('Calling remittanceService.getTransactionHistory()');

        // Display recent transactions with better error handling
        this.remittanceService.getTransactionHistory()
            .subscribe({
                next: (transactions) => {
                    console.log('Got transaction history response:', transactions);

                    // Remove the processing message
                    this.messages = this.messages.filter(msg => msg.id !== processingMessageId);

                    if (transactions && transactions.length > 0) {
                        // Show the transactions in a formatted way
                        let transactionList = "Your recent transactions:\n\n";
                        transactions.forEach((transaction, index) => {
                            // Safely handle date formatting - make sure it's a valid date
                            let dateStr = 'Unknown date';
                            try {
                                const date = new Date(transaction.createdAt);
                                if (!isNaN(date.getTime())) {
                                    dateStr = date.toLocaleDateString();
                                }
                            } catch (err) {
                                console.warn('Error formatting date:', err);
                            }

                            // Format status with proper capitalization (with safety check)
                            const status = transaction.status ?
                                (transaction.status.charAt(0).toUpperCase() +
                                    transaction.status.slice(1).toLowerCase()) : 'Unknown';

                            // Safely access recipient name
                            const recipientName = transaction.recipient?.name || 'Unknown';

                            // Build the transaction line
                            transactionList += `${index + 1}. ${dateStr}: ${transaction.amount} ${transaction.currency} to ${recipientName}\n   Status: ${status}\n\n`;
                        });

                        // Add message with action buttons
                        this.addBotMessage(
                            transactionList,
                            [
                                {
                                    text: 'View Details of Latest',
                                    action: () => this.router.navigate(['/transaction-confirmation', transactions[0].id], {
                                        queryParams: { _t: new Date().getTime() }
                                    })
                                }
                            ]
                        );
                    } else {
                        // No transactions found
                        this.addBotMessage("You don't have any transactions yet. When you send money or make deposits, they will appear here.");
                    }

                    // Force scroll to bottom for the response
                    this.scrollToBottomForced();
                },
                error: (error) => {
                    console.error('Error in subscription handler:', error);

                    // Remove the processing message
                    this.messages = this.messages.filter(msg => msg.id !== processingMessageId);

                    // Provide a more detailed error message if possible
                    this.addBotMessage("I'm having trouble retrieving your transaction history. This might be due to a temporary system issue. Please try again later.");

                    // Force scroll to bottom for the error message
                    this.scrollToBottomForced();
                }
            });
    }

    // Also add a dedicated method to handle the 'view transaction history' intent
    private isViewHistoryIntent(message: string): boolean {
        const lowercased = message.trim().toLowerCase();
        return lowercased.includes('transaction history') ||
            lowercased.includes('view history') ||
            lowercased.includes('view transactions') ||
            lowercased.includes('my transactions') ||
            lowercased === 'history' ||
            lowercased === 'check transaction history' ||
            lowercased === 'check history';
    }


    // Send message to chat service
    private sendMessageToService(message: string): void {
        this.chatService.sendMessage(message).subscribe({
            next: (command: BotCommand) => {
                // Process the bot's command/intent if needed
                console.log('Bot command:', command);

                // Handle specific intents
                if (command.intent === 'check_rates') {
                    this.handleCheckRates(command.entities);
                } else if (command.intent === 'send_money') {
                    this.handleSendMoney(command.entities);
                } else if (command.intent === 'check_balance') {
                    this.handleCheckBalance();
                } else if (command.intent === 'deposit') {
                    this.handleDeposit(command.entities);
                }
            },
            error: (error: any) => {
                console.error('Error sending message:', error);
            }
        });
    }

    // ---------- Voice Recognition Methods ----------

    // Optimized voice button handler
    async voiceButtonClicked(): Promise<void> {
        console.log('Voice button clicked, current state:', this.isListening ? 'listening' : 'not listening');

        if (this.isListening) {
            // If already listening, just stop
            this.stopVoiceRecognition();
            return;
        }

        // Skip permission check if we've already used the microphone
        if (!this.hasUsedMicrophoneBefore) {
            try {
                // Request microphone permission silently
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                this.hasUsedMicrophoneBefore = true;
            } catch (err) {
                // Show error if permission denied
                console.error('Microphone permission error:', err);
                this.addBotMessage('❌ Please allow microphone access to use voice commands.');
                return;
            }
        }

        // Start voice recognition
        this.startVoiceRecognition();
    }

    // Optimized start voice recognition
    startVoiceRecognition(): void {
        if (!this.voiceRecognitionSupported) {
            // Show a message to user
            this.addBotMessage('Sorry, voice recognition is not supported in your browser. Please try using Chrome or Edge.');
            return;
        }

        // Save current input value to restore if needed
        const previousInputValue = this.newMessage;

        // Update input field to show "Listening..."
        this.newMessage = 'Listening...';
        this.cdRef.detectChanges();

        // Clear the last transcript
        this.lastTranscript = '';

        // Start the voice recognition
        this.voiceService.start();
    }

    // Update listening message with transcript
    // Update the listening message to show feedback in the UI
    private updateListeningMessage(transcript: string): void {
        // Just update the input field with the transcript
        this.newMessage = transcript;
        this.cdRef.detectChanges();
    }

    // Check if we should auto-stop for specific commands
    private shouldStopListeningForCommand(transcript: string): boolean {
        const lowercased = transcript.toLowerCase();
        return lowercased.includes('send') ||
            lowercased.includes('check balance') ||
            lowercased.includes('exchange rate') ||
            lowercased.includes('deposit');
    }

    // Optimized stop voice recognition
    stopVoiceRecognition(): void {
        console.log('Stopping voice recognition, transcript:', this.lastTranscript);

        // Store the current transcript before stopping
        const transcript = this.lastTranscript;

        // Stop the recognition service
        this.voiceService.stop();

        // Clear the listening state
        this.isListening = false;

        // If we have a transcript, populate the input field with it
        if (transcript) {
            this.newMessage = transcript;

            // Focus on the input field
            setTimeout(() => {
                if (this.messageInput?.nativeElement) {
                    this.messageInput.nativeElement.focus();
                }
            }, 50);
        }
    }

    // Simplified voice command processing
    private processVoiceCommand(): void {
        this.isProcessingVoiceCommand = true;

        // If we have a transcript, simply update the input field
        if (this.lastTranscript) {
            // Set the message text but don't send
            this.newMessage = this.lastTranscript;

            // Reset
            this.lastTranscript = '';
            this.isProcessingVoiceCommand = false;
            return;
        }

        // If we don't have a transcript but have audio, send it for processing
        const audioBlob = this.voiceService.getAudioBlob();
        if (audioBlob) {
            // Process the audio
            this.chatService.processVoiceInput(audioBlob).subscribe({
                next: (command: BotCommand) => {
                    console.log('Voice command processed:', command);
                    this.isProcessingVoiceCommand = false;

                    // If we have a transcript, just populate the input field
                    if (command.text) {
                        // Set the message text but DON'T send
                        this.newMessage = command.text;

                        // Update UI
                        this.cdRef.detectChanges();
                    }
                },
                error: (error: any) => {
                    console.error('Error processing voice command:', error);
                    this.isProcessingVoiceCommand = false;

                    // Add error message
                    this.addBotMessage('Sorry, I had trouble understanding your voice command. Please try again or type your request.');
                }
            });
        } else {
            this.isProcessingVoiceCommand = false;
        }
    }

    // ----- Intent Handler Methods -----

    private handleCheckRates(entities: any): void {
        const fromCurrency = entities.fromCurrency || 'USD';
        const toCurrency = entities.toCurrency || 'EUR';

        this.remittanceService.getExchangeRate(fromCurrency, toCurrency)
            .subscribe({
                next: (result) => {
                    const botMessage = `The current exchange rate from ${fromCurrency} to ${toCurrency} is ${result.rate}`;
                    this.addBotMessage(botMessage);
                },
                error: (error: any) => {
                    console.error('Error fetching exchange rate:', error);
                }
            });
    }

    private handleCheckBalance(): void {
        if (!this.isAuthenticated) {
            // Add message suggesting login
            this.addBotMessage(
                'You need to log in to check your balance. Would you like to log in now?',
                [
                    {
                        text: 'Login',
                        action: () => this.router.navigate(['/login'])
                    }
                ]
            );
            return;
        }

        this.remittanceService.getUserBalance().subscribe({
            next: (balance) => {
                const botMessage = `Your current balance is ${balance.balance} ${balance.currency}.`;
                this.addBotMessage(botMessage);
            },
            error: (error) => {
                console.error('Error fetching user balance:', error);
                this.addBotMessage('Sorry, I had trouble retrieving your balance. Please try again later.');
            }
        });
    }

    private handleSendMoney(entities: any): void {
        console.log('Send money intent detected with entities:', entities);

        if (this.isAuthenticated) {
            // Get pending transaction details from chat service
            const pendingTransaction = this.chatService.getPendingTransaction();

            // Check if the recipient exists in saved recipients
            const recipientExists = entities.recipientExists ?? pendingTransaction.recipientExists ?? false;
            const recipientComplete = entities.recipientComplete ?? pendingTransaction.recipientComplete ?? false;

            if (!recipientExists) {
                // Ask user if they want to add a new recipient
                this.showConfirmAddRecipient(
                    entities.amount || pendingTransaction.amount,
                    entities.recipient || pendingTransaction.recipient,
                    entities.currency || pendingTransaction.currency || 'USD'
                );
                return;
            } else if (!recipientComplete) {
                // Recipient exists but needs more details
                this.showCompleteRecipientDetails(
                    entities.amount || pendingTransaction.amount,
                    entities.recipient || pendingTransaction.recipient,
                    entities.recipientId || pendingTransaction.recipientId,
                    entities.currency || pendingTransaction.currency || 'USD'
                );
                return;
            }

            // Navigate to send-money form with appropriate params
            this.router.navigate(['/send-money'], {
                queryParams: {
                    amount: entities.amount || pendingTransaction.amount,
                    currency: entities.currency || pendingTransaction.currency || 'USD',
                    recipient: entities.recipient || pendingTransaction.recipient,
                    recipientId: entities.recipientId || pendingTransaction.recipientId
                }
            });
        } else {
            // Add bot message suggesting login
            this.addBotMessage(
                'You need to log in to send money. Would you like to log in now?',
                [
                    {
                        text: 'Login',
                        action: () => this.router.navigate(['/login'])
                    }
                ]
            );
        }
    }

    private handleDeposit(entities: any): void {
        const amount = entities.amount || 0;
        const currency = entities.currency || 'USD';
        const paymentMethod = entities.paymentMethod || 'card';

        if (!this.isAuthenticated) {
            // Add message suggesting login
            this.addBotMessage(
                'You need to log in to make a deposit. Would you like to log in now?',
                [
                    {
                        text: 'Login',
                        action: () => this.router.navigate(['/login'])
                    }
                ]
            );
            return;
        }

        // Show confirmation message with action buttons
        this.addBotMessage(
            `Would you like to deposit ${amount} ${currency} to your account?`,
            [
                {
                    text: 'Yes, proceed to deposit',
                    action: () => this.router.navigate(['/deposit'], {
                        queryParams: {
                            amount: amount,
                            currency: currency,
                            method: paymentMethod
                        }
                    })
                },
                {
                    text: 'No, cancel',
                    action: () => this.handleCancelTransaction()
                }
            ]
        );
    }

    // ----- Helper Methods -----

    private showConfirmAddRecipient(amount: number, recipientName: string, currency: string): void {
        // Add a confirmation message with action buttons
        this.addBotMessage(
            `Would you like to add ${recipientName} as a new recipient?`,
            [
                {
                    text: 'Yes, add recipient',
                    action: () => this.handleAddNewRecipient(amount, recipientName, currency)
                },
                {
                    text: 'No, cancel',
                    action: () => this.handleCancelTransaction()
                }
            ]
        );
    }

    private showCompleteRecipientDetails(amount: number, recipientName: string, recipientId: string, currency: string): void {
        // Add a confirmation message with action buttons
        this.addBotMessage(
            `Would you like to complete ${recipientName}'s details before sending money?`,
            [
                {
                    text: 'Yes, complete details',
                    action: () => this.handleCompleteRecipientDetails(amount, recipientName, recipientId, currency)
                },
                {
                    text: 'No, cancel',
                    action: () => this.handleCancelTransaction()
                }
            ]
        );
    }

    private handleAddNewRecipient(amount: number, recipientName: string, currency: string): void {
        // Navigate to the remittance form with new recipient flag
        this.router.navigate(['/send-money'], {
            queryParams: {
                amount: amount,
                currency: currency,
                recipient: recipientName,
                newRecipient: true
            }
        });
    }

    private handleCompleteRecipientDetails(amount: number, recipientName: string, recipientId: string, currency: string): void {
        // Navigate to the remittance form with complete recipient details flag
        this.router.navigate(['/send-money'], {
            queryParams: {
                amount: amount,
                currency: currency,
                recipient: recipientName,
                recipientId: recipientId,
                completeRecipient: true
            }
        });
    }

    private handleCancelTransaction(): void {
        // Add a message indicating the transaction was cancelled
        this.addBotMessage('Transaction cancelled. How else can I help you today?');

        // Clear pending transaction
        this.chatService.clearPendingTransaction();
    }

    // Helper methods for viewing/managing recipients
    viewRecipients(): void {
        // In a real implementation, this would navigate to a recipients page
        // For now, use the remittance service to fetch and display recipients
        this.remittanceService.getSavedRecipients().subscribe({
            next: (recipients) => {
                if (recipients && recipients.length > 0) {
                    let recipientsList = "Your saved recipients:\n";
                    recipients.forEach((recipient, index) => {
                        recipientsList += `${index + 1}. ${recipient.name} (${recipient.country})\n`;
                    });

                    this.addBotMessage(recipientsList);
                } else {
                    this.addBotMessage("You don't have any saved recipients yet.");
                }
            },
            error: (error) => {
                console.error('Error retrieving recipients:', error);
                this.addBotMessage("I'm having trouble retrieving your recipients. Please try again later.");
            }
        });
    }

    addNewRecipient(): void {
        // Navigate to the send money form with newRecipient flag
        this.router.navigate(['/send-money'], {
            queryParams: {
                newRecipient: true
            }
        });
    }

    viewAllTransactions(): void {
        // In a real implementation, this would navigate to a transactions history page
        // For now, we'll just show the transactions in the chat
        this.remittanceService.getTransactionHistory().subscribe({
            next: (transactions) => {
                if (transactions && transactions.length > 0) {
                    let transactionList = "Your recent transactions:\n";
                    transactions.forEach((transaction, index) => {
                        transactionList += `${index + 1}. ${transaction.amount} ${transaction.currency} to ${transaction.recipient?.name} - Status: ${transaction.status}\n`;
                    });

                    this.addBotMessage(transactionList);
                } else {
                    this.addBotMessage("You don't have any transactions yet.");
                }
            },
            error: (error) => {
                console.error('Error retrieving transaction history:', error);
                this.addBotMessage("I'm having trouble retrieving your transaction history. Please try again later.");
            }
        });
    }

    // Utility method to check for microphone permission
    private async checkMicrophonePermission(silent: boolean = false): Promise<boolean> {
        try {
            // Only display messages if not silent
            if (!silent) {
                this.addBotMessage('Checking microphone access...');
            }

            // Try to get microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Release the stream immediately
            stream.getTracks().forEach(track => track.stop());

            // Display success message if not silent
            if (!silent) {
                this.addBotMessage('✅ Microphone access granted!');
            }

            return true;
        } catch (err) {
            console.error('Microphone permission error:', err);

            // Display error message if not silent
            if (!silent) {
                this.addBotMessage('❌ Could not access microphone. Please check your browser settings and ensure microphone access is allowed.');
            }

            return false;
        }
    }

    // TrackBy function for message list to improve performance
    trackByMessageId(index: number, message: ChatMessage): string {
        return message.id;
    }

    clearChat(): void {
        this.chatService.clearChat();
    }

    login(): void {
        this.router.navigate(['/login']);
    }
    private checkAuth(): void {
        console.log('Chat Component - Current auth state:', this.isAuthenticated);

        // If authService has the checkAuthStatus debugging method
        if (this.authService['checkAuthStatus']) {
            const status = this.authService['checkAuthStatus']();
            console.log('Detailed auth status:', status);

            // If there's a mismatch, try to fix it
            if (status.hasToken !== this.isAuthenticated) {
                console.warn('Auth state mismatch detected!');

                if (this.authService['refreshAuthStatus']) {
                    console.log('Attempting to refresh auth status...');
                    this.authService['refreshAuthStatus']();

                    // Update local isAuthenticated property
                    this.isAuthenticated = !!this.authService.currentUser?.isAuthenticated;
                    console.log('Updated isAuthenticated:', this.isAuthenticated);
                }
            }
        }
    }
}