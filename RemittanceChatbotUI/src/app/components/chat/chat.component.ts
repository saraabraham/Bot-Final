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
            });

        // Subscribe to voice transcripts
        this.voiceService.transcript$
            .pipe(takeUntil(this.destroy$))
            .subscribe(transcript => {
                if (transcript) {
                    this.newMessage = transcript;
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
                }
            },
            error: (error: any) => {
                console.error('Error sending message:', error);
            }
        });
    }

    startVoiceRecognition(): void {
        this.voiceService.start();
    }

    stopVoiceRecognition(): void {
        this.voiceService.stop();

        // Get the audio blob for backend STT processing
        const audioBlob = this.voiceService.getAudioBlob();
        if (audioBlob) {
            this.chatService.processVoiceInput(audioBlob).subscribe({
                next: (command: BotCommand) => {
                    console.log('Voice command processed:', command);
                },
                error: (error: any) => {
                    console.error('Error processing voice command:', error);
                }
            });
        } else if (this.newMessage) {
            // If we have transcript but no blob, just send as text
            this.sendMessage();
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

    private handleSendMoney(entities: any): void {
        // This would typically redirect to a form or open a modal
        console.log('Send money intent detected with entities:', entities);

        if (this.isAuthenticated) {
            // In a real app, you might do:
            this.router.navigate(['/send-money'], {
                queryParams: {
                    amount: entities.amount,
                    currency: entities.currency,
                    recipient: entities.recipient
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
}