// Update chat.component.ts

import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
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
        private router: Router
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
                        transcript.toLowerCase().includes('exchange rate')) {
                        this.stopVoiceRecognition();
                    }
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
                timestamp: new Date()
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
                timestamp: new Date()
            });
        }
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