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

    // Update this part of sendMessage() method in chat.component.ts
    // Update the sendMessage method in ChatComponent to handle conversation state

    sendMessage(): void {
        if (!this.newMessage.trim()) return;

        const message = this.newMessage;
        this.newMessage = '';

        // Add user message to chat
        const userMessageId = Math.random().toString(36).substring(7);
        this.messages.push({
            id: userMessageId,
            text: message,
            sender: MessageSender.USER,
            timestamp: new Date()
        });

        // Check if we're in the middle of a conversation flow
        const conversationState = this.chatService.getConversationState();

        // If we're expecting a recipient name
        if (conversationState.expectingRecipient && conversationState.pendingAction === 'send') {
            // Use the current message as the recipient name
            const recipientName = message.trim();

            // Clear the conversation state
            this.chatService.clearConversationState();

            // Set the pending transaction
            this.chatService.setPendingTransaction({
                amount: conversationState.partialData?.amount || 0,
                currency: conversationState.partialData?.currency || 'USD',
                recipient: recipientName
            });

            // Add bot confirmation message
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: `I'll help you send money to ${recipientName}. Let me take you to the send money form.`,
                sender: MessageSender.BOT,
                timestamp: new Date()
            });

            // Navigate to send money form
            setTimeout(() => {
                this.router.navigate(['/send-money'], {
                    queryParams: {
                        recipient: recipientName,
                        amount: conversationState.partialData?.amount || undefined
                    }
                });
            }, 1000);

            return;
        }

        // If we're expecting an amount
        if (conversationState.expectingAmount) {
            // Try to parse the amount from the message
            const amountMatch = message.match(/\$?(\d+(?:\.\d+)?)/);
            const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

            if (amount <= 0) {
                // If we couldn't parse a valid amount, ask again
                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: "I couldn't understand the amount. Please enter a valid number.",
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
                return;
            }

            // Handle based on pending action
            if (conversationState.pendingAction === 'send') {
                // Now ask for recipient
                this.chatService.setConversationState({
                    expectingAmount: false,
                    expectingRecipient: true,
                    partialData: {
                        ...conversationState.partialData,
                        amount: amount
                    }
                });

                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: `Great! You want to send $${amount}. Who would you like to send it to?`,
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
                return;
            } else if (conversationState.pendingAction === 'deposit') {
                // Clear conversation state
                this.chatService.clearConversationState();

                // Navigate to deposit form
                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: `I'll help you deposit $${amount} to your account. Taking you to the deposit form.`,
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });

                setTimeout(() => {
                    this.router.navigate(['/deposit'], {
                        queryParams: {
                            amount: amount
                        }
                    });
                }, 1000);
                return;
            }
        }

        // Process message locally first to check for intents
        const sendMoneyMatch = message.match(/(?:send|transfer|remit)(?:\s+(?:(?:\$?\s*)?(\d+(?:\.\d+)?))?(?:\s*dollars|\s*euro|\s*pound|\s*usd|\s*eur|\s*gbp)?(?:\s+(?:to\s+)(\w+))?)?/i);
        const depositMatch = message.match(/(?:deposit|add\s+money|top\s+up)(?:\s+(?:(?:\$?\s*)?(\d+(?:\.\d+)?))?(?:\s*dollars|\s*euro|\s*pound|\s*usd|\s*eur|\s*gbp)?)?/i);

        // Check if this is just the word "deposit"
        const isSimpleDeposit = message.trim().toLowerCase() === 'deposit';

        // Check if this is just "send money" 
        const isSimpleSendMoney = message.trim().toLowerCase() === 'send money' ||
            message.trim().toLowerCase() === 'send';

        // Handle single-word deposit command
        if ((isSimpleDeposit || depositMatch) && this.isAuthenticated) {
            console.log('Detected deposit intent locally');

            // Get amount if provided, otherwise ask for amount
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
                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: `I'll help you deposit $${amount} to your account. Taking you to the deposit form.`,
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });

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

                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: "How much would you like to deposit?",
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
            }
            return;
        }

        // Handle simple "send money" command
        if ((isSimpleSendMoney || sendMoneyMatch) && this.isAuthenticated) {
            console.log('Detected send money intent locally');

            let amount = 0;
            let recipientName = '';

            // Extract amount and recipient if available
            if (sendMoneyMatch && sendMoneyMatch[1]) {
                amount = parseFloat(sendMoneyMatch[1].replace(/[$,]/g, ''));
            }

            if (sendMoneyMatch && sendMoneyMatch[2]) {
                recipientName = sendMoneyMatch[2];
            }

            // For simple commands without recipient, ask for more info
            if (isSimpleSendMoney || !recipientName) {
                // Set conversation state to expect recipient
                this.chatService.setConversationState({
                    expectingRecipient: true,
                    pendingAction: 'send',
                    partialData: {
                        amount: amount
                    }
                });

                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: "Who would you like to send money to?",
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
                return;
            }

            // If we have recipient, proceed normally
            this.chatService.setPendingTransaction({
                amount: amount,
                currency: 'USD',
                recipient: recipientName
            });

            // Add confirmation message
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: `I'll help you send money to ${recipientName}. Taking you to the send money form.`,
                sender: MessageSender.BOT,
                timestamp: new Date()
            });

            // Navigate to send money form after a short delay
            setTimeout(() => {
                this.router.navigate(['/send-money'], {
                    queryParams: {
                        amount: amount > 0 ? amount : undefined,
                        recipient: recipientName
                    }
                });
            }, 1000);
            return;
        }
        // Check for "check rates" command
        const checkRatesMatch = message.trim().toLowerCase() === 'check rates' ||
            message.trim().toLowerCase() === 'exchange rates' ||
            message.trim().toLowerCase() === 'rates';

        if (checkRatesMatch) {
            // Tell the user we're taking them to the exchange rates page
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: "I'll help you check exchange rates. Taking you to our exchange rate calculator.",
                sender: MessageSender.BOT,
                timestamp: new Date()
            });

            // Navigate to exchange rates form after a short delay
            setTimeout(() => {
                this.router.navigate(['/exchange-rates']);
            }, 1000);
            return;
        }

        // Handle direct currency pair checks
        const directCurrencyPairMatch = message.match(/(\w{3})\s+(?:to|and)\s+(\w{3})/i);
        if (directCurrencyPairMatch) {
            const fromCurrency = directCurrencyPairMatch[1].toUpperCase();
            const toCurrency = directCurrencyPairMatch[2].toUpperCase();

            // Tell the user we're taking them to the exchange rates page
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: `I'll help you check the exchange rate from ${fromCurrency} to ${toCurrency}. Taking you to our exchange rate calculator.`,
                sender: MessageSender.BOT,
                timestamp: new Date()
            });

            // Navigate to exchange rates form with the currencies pre-selected
            setTimeout(() => {
                this.router.navigate(['/exchange-rates'], {
                    queryParams: {
                        fromCurrency: fromCurrency,
                        toCurrency: toCurrency
                    }
                });
            }, 1000);
            return;
        }
        // Check for "manage recipients" command
        const manageRecipientsMatch = message.trim().toLowerCase() === 'manage recipients' ||
            message.trim().toLowerCase() === 'recipients' ||
            message.trim().toLowerCase() === 'manage recipient';

        if (manageRecipientsMatch && this.isAuthenticated) {
            // Display recipient options
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: "What would you like to do with your recipients?",
                sender: MessageSender.BOT,
                timestamp: new Date(),
                actions: [
                    {
                        text: 'View Recipients',
                        action: () => this.viewRecipients()
                    },
                    {
                        text: 'Add New Recipient',
                        action: () => this.addNewRecipient()
                    }
                ]
            });
            return;
        }

        // Check for "check transaction status" command
        const checkStatusMatch = message.trim().toLowerCase() === 'check transaction status' ||
            message.trim().toLowerCase() === 'transaction status' ||
            message.trim().toLowerCase() === 'check status';

        if (checkStatusMatch && this.isAuthenticated) {
            // Display recent transactions
            this.remittanceService.getTransactionHistory().subscribe({
                next: (transactions) => {
                    if (transactions && transactions.length > 0) {
                        // Show the most recent transaction
                        const latestTransaction = transactions[0];
                        this.messages.push({
                            id: Math.random().toString(36).substring(7),
                            text: `Your most recent transaction is: ${latestTransaction.amount} ${latestTransaction.currency} to ${latestTransaction.recipient?.name}. Status: ${latestTransaction.status}`,
                            sender: MessageSender.BOT,
                            timestamp: new Date(),
                            actions: [
                                {
                                    text: 'View Details',
                                    action: () => this.router.navigate(['/transaction-confirmation', latestTransaction.id])
                                },
                                {
                                    text: 'View All Transactions',
                                    action: () => this.viewAllTransactions()
                                }
                            ]
                        });
                    } else {
                        this.messages.push({
                            id: Math.random().toString(36).substring(7),
                            text: "You don't have any transactions yet.",
                            sender: MessageSender.BOT,
                            timestamp: new Date()
                        });
                    }
                },
                error: (error) => {
                    console.error('Error retrieving transaction history:', error);
                    this.messages.push({
                        id: Math.random().toString(36).substring(7),
                        text: "I'm having trouble retrieving your transaction history. Please try again later.",
                        sender: MessageSender.BOT,
                        timestamp: new Date()
                    });
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

    // Update the voice-related methods in ChatComponent

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

        // Add a listening message
        const listeningMessageId = Math.random().toString(36).substring(7);
        this.messages.push({
            id: listeningMessageId,
            text: '🎤 Listening... (say your command)',
            sender: MessageSender.USER,
            timestamp: new Date()
        });

        // Scroll to bottom to show the listening message
        this.scrollToBottom();

        // Clear the last transcript
        this.lastTranscript = '';

        // Start the voice recognition
        this.voiceService.start();

        // Listen for transcript
        this.voiceService.transcript$
            .pipe(takeUntil(this.destroy$))
            .subscribe(transcript => {
                if (transcript && transcript !== this.lastTranscript) {
                    console.log('Received transcript:', transcript);
                    this.lastTranscript = transcript;

                    // Update the input field with the transcript
                    this.newMessage = transcript;

                    // Update the listening message with the transcript
                    const updatedMessages: ChatMessage[] = [];
                    for (const msg of this.messages) {
                        if (msg.id === listeningMessageId) {
                            updatedMessages.push({
                                ...msg,
                                text: `🎤 "${transcript}"`
                            });
                        } else {
                            updatedMessages.push(msg);
                        }
                    }
                    this.messages = updatedMessages;

                    // Scroll to show the updated message
                    this.scrollToBottom();
                }
            });
    }
    stopVoiceRecognition(): void {
        console.log('Stopping voice recognition, transcript:', this.lastTranscript);

        // Stop the recognition service
        this.voiceService.stop();

        // Remove the listening message if it exists
        const updatedMessages: ChatMessage[] = [];
        for (const msg of this.messages) {
            if (!msg.text.includes('🎤 Listening...')) {
                updatedMessages.push(msg);
            }
        }
        this.messages = updatedMessages;

        // Make sure the input field is populated with the transcript
        if (this.lastTranscript) {
            this.newMessage = this.lastTranscript;

            // Focus on the input field so the user can see it
            setTimeout(() => {
                const inputElement = document.querySelector('.chat-input input') as HTMLInputElement;
                if (inputElement) {
                    inputElement.focus();
                }
            }, 100);
        }
    }

    // New method to process a voice transcript
    private processVoiceTranscript(transcript: string): void {
        console.log('Processing voice transcript:', transcript);

        // First make sure the UI is updated to show the transcript
        const updatedMessages: ChatMessage[] = [];
        for (const msg of this.messages) {
            if (msg.text.startsWith('🎤 "') && msg.text.endsWith('"')) {
                updatedMessages.push({
                    ...msg,
                    text: `🎤 "${transcript}"`,  // Ensure it shows the final transcript
                    isProcessing: false
                });
            } else {
                updatedMessages.push(msg);
            }
        }
        this.messages = updatedMessages;

        // Wait a moment to ensure the UI is updated
        setTimeout(() => {
            // Use the transcript as the new message
            this.newMessage = transcript;

            // Send it through the normal message flow
            this.sendMessage();
        }, 1000);
    }
    // Update the processVoiceCommand method in chat.component.ts

    private processVoiceCommand(): void {
        this.isProcessingVoiceCommand = true;

        // If we have a transcript, simply process it directly as a text message
        if (this.lastTranscript) {
            // Set the message text
            this.newMessage = this.lastTranscript;

            // Send the message through the normal text channel
            this.sendMessage();

            // Reset
            this.lastTranscript = '';
            this.isProcessingVoiceCommand = false;
            return;
        }

        // If we don't have a transcript but have audio, send it for processing
        const audioBlob = this.voiceService.getAudioBlob();
        if (audioBlob) {
            // Show a loading message
            this.messages.push({
                id: Math.random().toString(36).substring(7),
                text: '🎤 Processing voice...',
                sender: MessageSender.USER,
                timestamp: new Date()
            });

            // Process the audio
            this.chatService.processVoiceInput(audioBlob).subscribe({
                next: (command: BotCommand) => {
                    console.log('Voice command processed:', command);
                    this.isProcessingVoiceCommand = false;

                    // If we have a transcript, use it
                    if (command.text) {
                        // Set the message text
                        this.newMessage = command.text;

                        // Send the message through the normal text channel
                        this.sendMessage();
                    }
                },
                error: (error: any) => {
                    console.error('Error processing voice command:', error);
                    this.isProcessingVoiceCommand = false;

                    // Add error message
                    this.messages.push({
                        id: Math.random().toString(36).substring(7),
                        text: 'Sorry, I had trouble understanding your voice command. Please try again or type your request.',
                        sender: MessageSender.BOT,
                        timestamp: new Date()
                    });
                }
            });
        } else {
            this.isProcessingVoiceCommand = false;
        }
    }

    // Add this method to the ChatComponent
    // Add a property to track if we've checked mic permission
    private hasCheckedMicPermission = false;

    // Update to allow silent permission check
    private async checkMicrophonePermission(silent: boolean = false): Promise<boolean> {
        try {
            // Only display messages if not silent
            if (!silent) {
                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: 'Checking microphone access...',
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
            }

            // Try to get microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Release the stream immediately
            stream.getTracks().forEach(track => track.stop());

            // Display success message if not silent
            if (!silent) {
                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: '✅ Microphone access granted!',
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
            }

            return true;
        } catch (err) {
            console.error('Microphone permission error:', err);

            // Display error message if not silent
            if (!silent) {
                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: '❌ Could not access microphone. Please check your browser settings and ensure microphone access is allowed.',
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
            }

            return false;
        }
    }



    async voiceButtonClicked(): Promise<void> {
        console.log('Voice button clicked, current state:', this.isListening ? 'listening' : 'not listening');

        if (this.isListening) {
            // If already listening, just stop
            this.stopVoiceRecognition();
        } else {
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
                    this.messages.push({
                        id: Math.random().toString(36).substring(7),
                        text: '❌ Please allow microphone access to use voice commands.',
                        sender: MessageSender.BOT,
                        timestamp: new Date()
                    });
                    return;
                }
            }

            // Start voice recognition
            this.startVoiceRecognition();
        }
    }

    // Add a property to track if we've used the microphone before
    private hasUsedMicrophoneBefore = false;

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
    // Also add these helper methods to the ChatComponent class:

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

                    this.messages.push({
                        id: Math.random().toString(36).substring(7),
                        text: recipientsList,
                        sender: MessageSender.BOT,
                        timestamp: new Date()
                    });
                } else {
                    this.messages.push({
                        id: Math.random().toString(36).substring(7),
                        text: "You don't have any saved recipients yet.",
                        sender: MessageSender.BOT,
                        timestamp: new Date()
                    });
                }
            },
            error: (error) => {
                console.error('Error retrieving recipients:', error);
                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: "I'm having trouble retrieving your recipients. Please try again later.",
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
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

                    this.messages.push({
                        id: Math.random().toString(36).substring(7),
                        text: transactionList,
                        sender: MessageSender.BOT,
                        timestamp: new Date()
                    });
                } else {
                    this.messages.push({
                        id: Math.random().toString(36).substring(7),
                        text: "You don't have any transactions yet.",
                        sender: MessageSender.BOT,
                        timestamp: new Date()
                    });
                }
            },
            error: (error) => {
                console.error('Error retrieving transaction history:', error);
                this.messages.push({
                    id: Math.random().toString(36).substring(7),
                    text: "I'm having trouble retrieving your transaction history. Please try again later.",
                    sender: MessageSender.BOT,
                    timestamp: new Date()
                });
            }
        });
    }
}