import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, MessageSender, BotCommand } from '../models/message.model';
import { environment } from '../../environments/environment';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
    providedIn: 'root'
})
export class ChatService {
    private messages = new BehaviorSubject<ChatMessage[]>([]);
    public messages$ = this.messages.asObservable();

    private apiUrl = `${environment.apiUrl}/chat`;
    private isBrowser: boolean;

    constructor(
        private http: HttpClient,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        this.isBrowser = isPlatformBrowser(this.platformId);

        // Initialize with welcome message
        this.addMessage({
            id: uuidv4(),
            text: 'Welcome to our remittance chatbot! How can I help you today? You can send money, check rates, or manage recipients.',
            sender: MessageSender.BOT,
            timestamp: new Date()
        });

        // Load chat history if user is authenticated
        this.loadChatHistory();
    }

    private loadChatHistory(): void {
        // Only attempt to load history if in a browser environment
        if (!this.isBrowser) return;

        // Only attempt to load history if the user is logged in
        const token = localStorage.getItem('token');
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

        // Send to backend for processing
        return this.http.post<BotCommand>(`${this.apiUrl}/message`, { text }).pipe(
            tap(response => {
                // Update messages to replace the "typing" message with the actual response
                const currentMessages = this.messages.value;
                const updatedMessages = currentMessages.map(msg => {
                    if (msg.id === botMessageId) {
                        return {
                            ...msg,
                            text: this.generateBotResponse(response),
                            isProcessing: false
                        };
                    }
                    return msg;
                });
                this.messages.next(updatedMessages);
            })
        );
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
                            text: this.generateBotResponse(response),
                            isProcessing: false
                        };
                    }
                    return msg;
                });
                this.messages.next(updatedMessages);
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
}