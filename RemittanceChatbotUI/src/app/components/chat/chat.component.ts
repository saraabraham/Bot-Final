// Complete, fully updated chat.component.ts

import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, BehaviorSubject } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { VoiceRecognitionService } from '../../services/voice-recognition.service';
import { RemittanceService } from '../../services/remittance.service';
import { ChatMessage, MessageSender, BotCommand } from '../../models/message.model';
import { AuthService } from '../../services/auth.service';
import { v4 as uuidv4 } from 'uuid';

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

    // Changed from array to BehaviorSubject
    private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
    public messages$ = this.messagesSubject.asObservable();

    newMessage = '';
    isListening = false;
    isAuthenticated = false;
    inProgressRemittanceFlow = false; // Added to track if a remittance flow is in progress
    private destroy$ = new Subject<void>();
    private isBrowser = typeof window !== 'undefined';
    private localStorageKey = 'chat_messages';
    private maxStoredMessages = 50;

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

        // Load messages from storage
        this.loadMessagesFromStorage();

        // If no messages were loaded, initialize with welcome message
        if (this.messagesSubject.getValue().length === 0) {
            this.addBotMessage(
                'Welcome to our remittance chatbot! How can I help you today? You can send money, deposit funds, check rates, check your balance, or manage recipients.'
            );
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
            }
        });
    }

    ngAfterViewChecked(): void {
        this.scrollToBottom();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // Private helper methods
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

                this.messagesSubject.next(messages);
                console.log('Loaded messages from storage:', messages.length);
            }
        } catch (error) {
            console.error('Error loading messages from localStorage:', error);
        }
    }

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

    private deduplicateMessages(): void {
        const currentMessages = this.messagesSubject.getValue();
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
            this.messagesSubject.next(deduplicatedMessages);
            this.saveMessagesToStorage(deduplicatedMessages);
        }
    }

    private loadChatHistory(): void {
        // Only attempt to load history if in a browser environment
        if (!this.isBrowser) return;

        // Only attempt to load history if the user is logged in
        const token = this.authService.authToken;
        if (!token) return;

        // Only load server history if we don't have any messages yet
        if (this.messagesSubject.getValue().length > 0) return;

        this.chatService.getChatHistory().subscribe({
            next: (history: ChatMessage[]) => {
                if (history && history.length > 0) {
                    // Replace our welcome message with the actual history
                    const convertedMessages = history.map((msg: ChatMessage) => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp), // Convert string dates to Date objects
                        sender: msg.sender === 'user' ? MessageSender.USER : MessageSender.BOT
                    }));

                    this.messagesSubject.next(convertedMessages);

                    // Save to localStorage as well
                    this.saveMessagesToStorage(convertedMessages);
                }
            },
            error: (error: Error) => {
                console.error('Error loading chat history:', error);
            }
        });
    }

    private loadUserBalance(): void {
        this.remittanceService.getUserBalance()
            .subscribe({
                next: (balance) => {
                    console.log('User balance loaded:', balance);
                },
                error: (error) => {
                    console.error('Error loading user balance:', error);
                }
            });
    }

    private loadRecipients(): void {
        if (!this.authService.isAuthenticated) return;

        this.remittanceService.getSavedRecipients().subscribe({
            next: (recipients) => {
                console.log('Recipients loaded to cache:', recipients.length);
            },
            error: (error) => {
                console.error('Error loading recipients to cache:', error);
            }
        });
    }

    // Optimized subscriptions setup - consolidates all subscription logic
    private initializeSubscriptions(): void {
        // Authentication status subscription
        this.authService.currentUser$
            .pipe(takeUntil(this.destroy$))
            .subscribe(user => {
                this.isAuthenticated = !!user?.isAuthenticated;
            });

        // Chat messages subscription (if using external message service)
        this.chatService.messages$
            .pipe(takeUntil(this.destroy$))
            .subscribe((messages: ChatMessage[]) => {
                // Only update if different to avoid unnecessary renders
                const currentMessages = this.messagesSubject.getValue();
                if (messages.length !== currentMessages.length) {
                    this.messagesSubject.next(messages);
                }
            });

        // Subscribe to conversation state changes to track active remittance flows
        this.chatService.conversationState$
            .pipe(takeUntil(this.destroy$))
            .subscribe(state => {
                this.inProgressRemittanceFlow = !!state.flow && !state.completed; // Set flag when there's an active flow
            });

        // Setup voice recognition subscriptions
        this.setupVoiceRecognition();
    }

    // Enhanced voice recognition handling
    private setupVoiceRecognition(): void {
        // Subscribe to voice recognition status
        this.voiceService.isListening$
            .pipe(takeUntil(this.destroy$))
            .subscribe(isListening => {
                this.isListening = isListening;

                // When listening ends but we have a transcript and we're not already processing a command
                if (!isListening && !this.isProcessingVoiceCommand) {
                    // Get the transcript using the getter method
                    const transcript = this.voiceService.getTranscript();

                    if (transcript) {
                        // Process the transcript as a command rather than just filling the input field
                        this.processVoiceTranscriptAsCommand();
                    }
                }
            });

        // Voice transcripts subscription - only for real-time feedback
        this.voiceService.transcript$
            .pipe(takeUntil(this.destroy$))
            .subscribe(transcript => {
                // Update UI to show what is being transcribed, but don't set as input field value
                if (transcript) {
                    this.updateListeningMessage(transcript);
                }
            });
    }

    // Check if voice recognition is supported
    private checkVoiceSupport(): void {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        this.voiceRecognitionSupported = !!SpeechRecognition;
    }

    // Process voice transcript as a command
    private processVoiceTranscriptAsCommand(): void {
        // Get the current transcript using the getter method
        const transcript = this.voiceService.getTranscript();

        if (!transcript) return;

        this.isProcessingVoiceCommand = true;

        // Add user's voice message to chat
        this.addUserMessage(transcript);

        // Process the command
        this.chatService.sendMessage(transcript).subscribe({
            next: () => {
                this.isProcessingVoiceCommand = false;
                // Clear last transcript
                this.voiceService.clearTranscript();
            },
            error: (error) => {
                console.error('Error processing voice command:', error);
                this.addBotMessage('I had trouble processing your voice command. Please try again.');
                this.isProcessingVoiceCommand = false;
                // Clear last transcript
                this.voiceService.clearTranscript();
            }
        });
    }

    // Update the listening message to show feedback in the UI
    private updateListeningMessage(transcript: string): void {
        if (this.currentListeningMessageId) {
            // Get a copy of the current messages array
            const currentMessages = [...this.messagesSubject.getValue()];
            const updatedMessages = currentMessages.map((msg: ChatMessage) => {
                if (msg.id === this.currentListeningMessageId) {
                    return {
                        ...msg,
                        text: `🎤 Listening: "${transcript}"`
                    };
                }
                return msg;
            });

            // Update messages subject with the new array
            this.messagesSubject.next(updatedMessages);
        }
    }

    // Helper method to add user message
    private addUserMessage(text: string): string {
        const id = uuidv4();
        const newMessage = {
            id,
            text,
            sender: MessageSender.USER,
            timestamp: new Date()
        };

        // Update messages immutably to help with change detection
        const currentMessages = this.messagesSubject.getValue();
        this.messagesSubject.next([...currentMessages, newMessage]);
        this.cdRef.detectChanges();

        return id;
    }

    // Helper method to add bot message
    private addBotMessage(text: string, actions: any[] = []): string {
        const id = uuidv4();
        const newMessage = {
            id,
            text,
            sender: MessageSender.BOT,
            timestamp: new Date(),
            actions
        };

        // Update messages immutably
        const currentMessages = this.messagesSubject.getValue();
        this.messagesSubject.next([...currentMessages, newMessage]);
        this.cdRef.detectChanges();

        return id;
    }

    // Update bot message by ID
    public updateBotMessage(messageId: string, text: string): void {
        const currentMessages = this.messagesSubject.getValue();
        const updatedMessages = currentMessages.map((msg: ChatMessage) => {
            if (msg.id === messageId) {
                return {
                    ...msg,
                    text: text,
                    isProcessing: false
                };
            }
            return msg;
        });
        this.messagesSubject.next(updatedMessages);

        // Save the updated messages to localStorage
        this.saveMessagesToStorage(updatedMessages);
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

    // Enhanced send message handler with conversation flow awareness
    sendMessage(): void {
        if (!this.newMessage.trim()) return;

        const message = this.newMessage;
        this.newMessage = '';

        // Force scroll to bottom when user sends a message
        this.scrollToBottomForced();

        // Send the message through chat service (which now handles all conversation flows)
        this.chatService.sendMessage(message).subscribe({
            next: (command) => {
                console.log('Command processed:', command);
            },
            error: (error) => {
                console.error('Error sending message:', error);
                // Add error message to chat
                this.addBotMessage('Sorry, I encountered an error processing your request. Please try again.');
            }
        });
    }

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
        this.startVoiceRecognition(false);
    }

    // Optimized start voice recognition
    startVoiceRecognition(updateInputField: boolean = false): void {
        if (!this.voiceRecognitionSupported) {
            // Show a message to user
            this.addBotMessage('Sorry, voice recognition is not supported in your browser. Please try using Chrome or Edge.');
            return;
        }

        // Start the voice recognition
        this.voiceService.start(updateInputField);

        // Add a listening indicator message
        this.currentListeningMessageId = this.addBotMessage('🎤 Listening...');
    }

    // Optimized stop voice recognition
    stopVoiceRecognition(): void {
        console.log('Stopping voice recognition, transcript:', this.voiceService.getTranscript());

        // Store the current transcript before stopping
        const transcript = this.voiceService.getTranscript();

        // Stop the recognition service
        this.voiceService.stop();

        // Clear the listening state
        this.isListening = false;
    }

    // Clear chat
    clearChat(): void {
        // Check if a conversation flow is in progress
        if (this.inProgressRemittanceFlow) {
            // Show confirmation if a flow is in progress
            const confirmation = confirm("You're in the middle of a transaction. Are you sure you want to clear the chat?");
            if (!confirmation) return;
        }

        // Reset messages to just the welcome message
        const welcomeMessage: ChatMessage = {
            id: uuidv4(),
            text: 'Welcome to our remittance chatbot! How can I help you today? You can send money, deposit funds, check rates, check your balance, or manage recipients.',
            sender: MessageSender.BOT,
            timestamp: new Date()
        };

        this.messagesSubject.next([welcomeMessage]);
        this.saveMessagesToStorage([welcomeMessage]);

        // Clear conversation state
        this.chatService.clearConversationState();
    }

    // Login
    login(): void {
        this.router.navigate(['/login']);
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

}