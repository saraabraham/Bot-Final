// Updated chat.component.ts

import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
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

    messages: ChatMessage[] = [];
    newMessage = '';
    isListening = false;
    isAuthenticated = false;
    private destroy$ = new Subject<void>();

    // Add properties for enhanced voice recognition experience
    isProcessingVoiceCommand = false;
    voiceRecognitionSupported = true;
    lastTranscript = '';

    constructor(
        private chatService: ChatService,
        private voiceService: VoiceRecognitionService,
        private remittanceService: RemittanceService,
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute
    ) { }

    ngOnInit(): void {
        // Check authentication status
        this.isAuthenticated = this.authService.isAuthenticated;
        this.authService.currentUser$
            .pipe(takeUntil(this.destroy$))
            .subscribe(user => {
                this.isAuthenticated = !!user?.isAuthenticated;
            });

        // Subscribe to messages
        this.chatService.messages$
            .pipe(takeUntil(this.destroy$))
            .subscribe((messages: ChatMessage[]) => {
                this.messages = messages;
            });

        // Subscribe to voice recognition status
        this.voiceService.isListening$
            .pipe(takeUntil(this.destroy$))
            .subscribe(isListening => {
                this.isListening = isListening;

                // If stopped listening but have a transcript, process it
                if (!isListening && this.lastTranscript && !this.isProcessingVoiceCommand) {
                    this.processVoiceCommand();
                }
            });

        // Subscribe to voice transcripts
        this.voiceService.transcript$
            .pipe(takeUntil(this.destroy$))
            .subscribe(transcript => {
                if (transcript) {
                    this.newMessage = transcript;
                    this.lastTranscript = transcript;

                    // Automatically stop listening after getting a transcript
                    // This makes the experience more natural - say command, it stops listening
                    if (transcript.toLowerCase().includes('send') ||
                        transcript.toLowerCase().includes('check balance') ||
                        transcript.toLowerCase().includes('exchange rate') ||
                        transcript.toLowerCase().includes('deposit')) {
                        this.stopVoiceRecognition();
                    }
                }
            });

        // Check for transaction success query params (both deposit and send money)
        this.route.queryParams
            .pipe(takeUntil(this.destroy$))
            .subscribe(params => {
                // Handle deposit success
                if (params['depositSuccess'] === 'true' && params['amount'] && params['currency']) {
                    // Add a success message to the chat
                    this.messages.push({
                        id: Math.random().toString(36).substring(7),
                        text: `Your deposit of ${params['amount']} ${params['currency']} was successful! Your account has been updated.`,
                        sender: MessageSender.BOT,
                        timestamp: new Date()
                    });
                }

                // Handle send money success (if you have a similar parameter)
                if (params['transactionSuccess'] === 'true' && params['recipient']) {
                    // Add a success message to the chat
                    this.messages.push({
                        id: Math.random().toString(36).substring(7),
                        text: `Your money transfer to ${params['recipient']} was successful!`,
                        sender: MessageSender.BOT,
                        timestamp: new Date()
                    });
                }
            });

        // Check if browser supports voice recognition
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        this.voiceRecognitionSupported = !!SpeechRecognition;
    }

    ngAfterViewChecked(): void {
        this.scrollToBottom();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    scrollToBottom(): void {
        try {
            this.chatMessages.nativeElement.scrollTop =
                this.chatMessages.nativeElement.scrollHeight;
        } catch (err) { }
    }

    sendMessage(): void {
        if (!this.newMessage.trim()) return;

        const message = this.newMessage;
        this.newMessage = '';

        // Process message locally first to check for intents
        const sendMoneyMatch = message.match(/(?:send|transfer|remit)\s+(?:(?:\$?\s*)?(\d+(?:\.\d+)?))?(?:\s*dollars|\s*euro|\s*pound|\s*usd|\s*eur|\s*gbp)?\s+(?:to\s+)(\w+)/i);
        const depositMatch = message.match(/(deposit|add\s+money|top\s+up)\s+(?:(?:\$?\s*)?(\d+(?:\.\d+)?))?(?:\s*dollars|\s*euro|\s*pound|\s*usd|\s*eur|\s*gbp)?/i);

        // Check if this is a send money request and user is authenticated
        if (sendMoneyMatch && this.isAuthenticated) {
            console.log('Detected send money intent locally:', sendMoneyMatch);

            const amount = sendMoneyMatch[1] ? parseFloat(sendMoneyMatch[1].replace(/[$,]/g, '')) : 0;
            const recipientName = sendMoneyMatch[2];

            // Set pending transaction details
            this.chatService.setPendingTransaction({
                amount: amount,
                currency: 'USD', // Default, will be updated from server response if available
                recipient: recipientName
            });

            // Add user message to chat (the service won't add it since we're not calling sendMessage)
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: message,
                sender: MessageSender.USER,
                timestamp: new Date()
            });

            // Redirect to send money form
            this.router.navigate(['/send-money'], {
                queryParams: {
                    amount: amount,
                    recipient: recipientName
                }
            });
            return;
        }

        // Check if this is a deposit request and user is authenticated
        if (depositMatch && this.isAuthenticated) {
            console.log('Detected deposit intent locally:', depositMatch);

            const amount = depositMatch[2] ? parseFloat(depositMatch[2].replace(/[$,]/g, '')) : 0;

            // Set pending transaction details for deposit
            this.chatService.setPendingTransaction({
                amount: amount,
                currency: 'USD', // Default, will be updated from server response if available
                isDeposit: true
            });

            // Add user message to chat (the service won't add it since we're not calling sendMessage)
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: message,
                sender: MessageSender.USER,
                timestamp: new Date()
            });

            // Redirect to deposit form
            this.router.navigate(['/deposit'], {
                queryParams: {
                    amount: amount
                }
            });
            return;
        }

        // If no local handling, send to service for processing
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

    startVoiceRecognition(): void {
        if (!this.voiceRecognitionSupported) {
            // Show a message to user
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: 'Sorry, voice recognition is not supported in your browser. Please try using Chrome or Edge.',
                sender: MessageSender.BOT,
                timestamp: new Date()
            });
            return;
        }

        this.voiceService.start();
        this.lastTranscript = '';
    }

    stopVoiceRecognition(): void {
        this.voiceService.stop();
    }

    // Process voice command after recognition is complete
    private processVoiceCommand(): void {
        this.isProcessingVoiceCommand = true;

        // Get the audio blob for backend STT processing
        const audioBlob = this.voiceService.getAudioBlob();
        if (audioBlob) {
            this.chatService.processVoiceInput(audioBlob).subscribe({
                next: (command: BotCommand) => {
                    console.log('Voice command processed:', command);
                    this.isProcessingVoiceCommand = false;

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
                    console.error('Error processing voice command:', error);
                    this.isProcessingVoiceCommand = false;
                }
            });
        } else if (this.lastTranscript) {
            // If we have transcript but no blob, just send as text
            this.newMessage = this.lastTranscript;
            this.sendMessage();
            this.isProcessingVoiceCommand = false;
        }
    }

    clearChat(): void {
        this.chatService.clearChat();
    }

    login(): void {
        this.router.navigate(['/login']);
    }

    private handleCheckRates(entities: any): void {
        const fromCurrency = entities.fromCurrency || 'USD';
        const toCurrency = entities.toCurrency || 'EUR';

        this.remittanceService.getExchangeRate(fromCurrency, toCurrency)
            .subscribe({
                next: (result) => {
                    const botMessage = `The current exchange rate from ${fromCurrency} to ${toCurrency} is ${result.rate}`;

                    // Add bot message directly to chat
                    this.messages.push({
                        id: Math.random().toString(36).substring(7),
                        text: botMessage,
                        sender: MessageSender.BOT,
                        timestamp: new Date()
                    });
                },
                error: (error: any) => {
                    console.error('Error fetching exchange rate:', error);
                }
            });
    }

    private handleCheckBalance(): void {
        if (!this.isAuthenticated) {
            // Add message suggesting login
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: 'You need to log in to check your balance. Would you like to log in now?',
                sender: MessageSender.BOT,
                timestamp: new Date(),
                actions: [
                    {
                        text: 'Login',
                        action: () => this.router.navigate(['/login'])
                    }
                ]
            });
            return;
        }

        this.remittanceService.getUserBalance().subscribe({
            next: (balance) => {
                const botMessage = `Your current balance is ${balance.balance} ${balance.currency}.`;

                // Add bot message directly to chat
                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: botMessage,
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
            },
            error: (error) => {
                console.error('Error fetching user balance:', error);

                // Add error message
                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: 'Sorry, I had trouble retrieving your balance. Please try again later.',
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
            }
        });
    }

    private handleSendMoney(entities: any): void {
        // This would process the money transfer intent and redirect to form if needed
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
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: 'You need to log in to send money. Would you like to log in now?',
                sender: MessageSender.BOT,
                timestamp: new Date(),
                actions: [
                    {
                        text: 'Login',
                        action: () => this.router.navigate(['/login'])
                    }
                ]
            });
        }
    }

    // Add method to handle deposit intents
    private handleDeposit(entities: any): void {
        const amount = entities.amount || 0;
        const currency = entities.currency || 'USD';
        const paymentMethod = entities.paymentMethod || 'card';

        if (!this.isAuthenticated) {
            // Add message suggesting login
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: 'You need to log in to make a deposit. Would you like to log in now?',
                sender: MessageSender.BOT,
                timestamp: new Date(),
                actions: [
                    {
                        text: 'Login',
                        action: () => this.router.navigate(['/login'])
                    }
                ]
            });
            return;
        }

        // Show confirmation message with action buttons
        const messageId = Math.random().toString(36).substring(7);
        this.messages.push({
            id: messageId,
            text: `Would you like to deposit ${amount} ${currency} to your account?`,
            sender: MessageSender.BOT,
            timestamp: new Date(),
            actions: [
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
        });
    }

    // Add methods to handle recipient confirmation and details completion
    private showConfirmAddRecipient(amount: number, recipientName: string, currency: string): void {
        // Add a confirmation message with action buttons
        const messageId = Math.random().toString(36).substring(7);
        this.messages.push({
            id: messageId,
            text: `Would you like to add ${recipientName} as a new recipient?`,
            sender: MessageSender.BOT,
            timestamp: new Date(),
            actions: [
                {
                    text: 'Yes, add recipient',
                    action: () => this.handleAddNewRecipient(amount, recipientName, currency)
                },
                {
                    text: 'No, cancel',
                    action: () => this.handleCancelTransaction()
                }
            ]
        });
    }

    private showCompleteRecipientDetails(amount: number, recipientName: string, recipientId: string, currency: string): void {
        // Add a confirmation message with action buttons
        const messageId = Math.random().toString(36).substring(7);
        this.messages.push({
            id: messageId,
            text: `Would you like to complete ${recipientName}'s details before sending money?`,
            sender: MessageSender.BOT,
            timestamp: new Date(),
            actions: [
                {
                    text: 'Yes, complete details',
                    action: () => this.handleCompleteRecipientDetails(amount, recipientName, recipientId, currency)
                },
                {
                    text: 'No, cancel',
                    action: () => this.handleCancelTransaction()
                }
            ]
        });
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
        this.messages.push({
            id: Math.random().toString(36).substring(7),
            text: 'Transaction cancelled. How else can I help you today?',
            sender: MessageSender.BOT,
            timestamp: new Date()
        });

        // Clear pending transaction
        this.chatService.clearPendingTransaction();
    }
}