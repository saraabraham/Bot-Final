// Enhanced chat.component.ts

import {
    Component, OnInit, OnDestroy, ViewChild, ElementRef,
    AfterViewChecked, ChangeDetectorRef
} from '@angular/core';
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
    inProgressRemittanceFlow = false; // Added to track if a remittance flow is in progress
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

        // Subscribe to conversation state changes to track active remittance flows
        this.chatService.conversationState$
            .pipe(takeUntil(this.destroy$))
            .subscribe(state => {
                this.inProgressRemittanceFlow = !!state.flow && !state.completed; // Set flag when there's an active flow
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

    // Enhanced send message handler with conversation flow awareness
    sendMessage(): void {
        // Only process if there's a non-empty message and user has pressed Enter or clicked Send
        if (!this.newMessage.trim()) return;

        const message = this.newMessage;
        this.newMessage = '';

        // Force scroll to bottom when user sends a message
        this.scrollToBottomForced();

        // Add a slight delay to ensure the UI updates first (helps with perceived responsiveness)
        setTimeout(() => {
            // Send the message through chat service
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
        }, 10); // Very small delay, just enough to let the UI update
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

    // Voice input methods
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

    // Clear chat
    clearChat(): void {
        // Check if a conversation flow is in progress
        if (this.inProgressRemittanceFlow) {
            // Show confirmation if a flow is in progress
            const confirmation = confirm("You're in the middle of a transaction. Are you sure you want to clear the chat?");
            if (!confirmation) return;
        }

        // Use the chat service to clear chat
        this.chatService.clearChat();
    }

    // Login
    login(): void {
        this.router.navigate(['/login']);
    }

    // Check auth
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