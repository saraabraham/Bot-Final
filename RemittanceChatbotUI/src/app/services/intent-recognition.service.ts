// src/app/services/intent-recognition.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface IntentPattern {
    id: number;
    intentType: string;
    pattern: string;
    priority: number;
}

export interface EntityPattern {
    id: number;
    entityType: string;
    pattern: string;
    priority: number;
}

export interface RecognizedIntent {
    intent: string;
    confidence: number;
    entities: { [key: string]: any };
    matchedPattern?: string;
}

export interface ConversationFlowStep {
    promptTemplate: string;
    nextSteps: string[];
}

@Injectable({
    providedIn: 'root'
})
export class IntentRecognitionService {
    private apiUrl = `${environment.apiUrl}/recognition`;

    // Cache for patterns to avoid excessive API calls
    private intentPatterns: IntentPattern[] = [];
    private entityPatterns: EntityPattern[] = [];
    private lastPatternFetch: number = 0;
    private cacheDuration = 1000 * 60 * 30; // 30 minutes

    // Common intents and their patterns (fallback if API is unavailable)
    private readonly localIntentPatterns = [
        // Send money patterns
        {
            intentType: 'send_money',
            pattern: '(?:send|transfer|remit)\\s+(?:(?:\\$?\\s*)?(\\d+(?:\\.\\d+)?))?\\s*(?:dollars|euro|pound|usd|eur|gbp)?\\s+(?:to\\s+)?(\\w+)',
            priority: 10
        },
        {
            intentType: 'send_money',
            pattern: '(?:send|transfer|pay)\\s+(?:money|funds)?',
            priority: 5
        },

        // Deposit patterns
        {
            intentType: 'deposit',
            pattern: '(?:deposit|add\\s+money|top\\s+up)\\s+(?:(?:\\$?\\s*)?(\\d+(?:\\.\\d+)?))?\\s*(?:dollars|euro|pound|usd|eur|gbp)?',
            priority: 10
        },
        {
            intentType: 'deposit',
            pattern: '(?:deposit|add)\\s+(?:money|funds)?',
            priority: 5
        },

        // Balance check patterns
        {
            intentType: 'check_balance',
            pattern: '(?:balance|how\\s+much|available\\s+funds|account\\s+balance)',
            priority: 5
        },

        // Exchange rate patterns
        {
            intentType: 'check_rates',
            pattern: '(?:rate|exchange|conversion|convert)\\s*(\\w{3})?\\s*(?:to|and)\\s*(\\w{3})?',
            priority: 5
        }
    ];

    // Common entity extraction patterns
    private readonly localEntityPatterns = [
        {
            entityType: 'amount',
            pattern: '\\$?(\\d+(?:\\.\\d{1,2})?)',
            priority: 10
        },
        {
            entityType: 'currency',
            pattern: '(USD|dollars|US dollars|EUR|euros|GBP|pounds|INR|rupees)',
            priority: 10
        },
        {
            entityType: 'recipient',
            pattern: 'to ([a-zA-Z]+(?:\\s+[a-zA-Z]+)?)',
            priority: 10
        }
    ];

    // Currency mapping for normalization
    private readonly currencyMap: { [key: string]: string } = {
        'dollar': 'USD',
        'dollars': 'USD',
        'usd': 'USD',
        'us dollar': 'USD',
        'us dollars': 'USD',
        '$': 'USD',
        'euro': 'EUR',
        'euros': 'EUR',
        'eur': 'EUR',
        '€': 'EUR',
        'pound': 'GBP',
        'pounds': 'GBP',
        'gbp': 'GBP',
        '£': 'GBP',
        'rupee': 'INR',
        'rupees': 'INR',
        'inr': 'INR',
        '₹': 'INR'
    };

    // Payment method mapping for normalization
    private readonly paymentMethodMap: { [key: string]: string } = {
        'card': 'card',
        'credit card': 'card',
        'debit card': 'card',
        'credit': 'card',
        'debit': 'card',
        'bank': 'bank',
        'bank transfer': 'bank',
        'transfer': 'bank',
        'wire': 'bank',
        'wire transfer': 'bank',
        'wallet': 'wallet',
        'digital wallet': 'wallet',
        'e-wallet': 'wallet',
        'paypal': 'wallet',
        'apple pay': 'wallet',
        'google pay': 'wallet'
    };

    constructor(private http: HttpClient) {
        // Preload patterns
        this.refreshPatterns();
    }

    /**
     * Recognize intent from user text
     * @param text The user input text
     * @returns RecognizedIntent with intent, confidence, and entities
     */
    recognizeIntent(text: string): RecognizedIntent {
        // Ensure we have patterns loaded
        if (this.shouldRefreshPatterns()) {
            this.refreshPatterns();
        }

        // Use available patterns (API or local)
        const patterns = this.intentPatterns.length > 0
            ? this.intentPatterns
            : this.localIntentPatterns.map((p, i) => ({
                id: i,
                intentType: p.intentType,
                pattern: p.pattern,
                priority: p.priority
            }));

        // Match to the highest-priority intent
        let bestMatch: {
            intentType: string,
            confidence: number,
            matchedPattern: string,
            entities: { [key: string]: any }
        } | null = null;

        // Try each pattern
        for (const pattern of patterns) {
            // Create regex from pattern
            try {
                const regex = new RegExp(pattern.pattern, 'i');
                const match = text.match(regex);

                if (match) {
                    // Calculate confidence
                    const matchLength = match[0].length;
                    const confidence = (matchLength / text.length) * (pattern.priority / 10);

                    // Check if this is the best match so far
                    if (!bestMatch || confidence > bestMatch.confidence) {
                        bestMatch = {
                            intentType: pattern.intentType,
                            confidence,
                            matchedPattern: pattern.pattern,
                            entities: {}
                        };
                    }
                }
            } catch (e) {
                console.error(`Invalid regex pattern: ${pattern.pattern}`, e);
            }
        }

        // If no intent matched, return unknown
        if (!bestMatch) {
            return {
                intent: 'unknown',
                confidence: 0,
                entities: {}
            };
        }

        // Extract entities
        bestMatch.entities = this.extractEntities(text, bestMatch.intentType);

        return {
            intent: bestMatch.intentType,
            confidence: bestMatch.confidence,
            entities: bestMatch.entities,
            matchedPattern: bestMatch.matchedPattern
        };
    }

    /**
     * Extract entities from text based on entity patterns
     * @param text The user input text
     * @param intentType The recognized intent type
     * @returns Object with extracted entities
     */
    private extractEntities(text: string, intentType: string): { [key: string]: any } {
        const entities: { [key: string]: any } = {};
        const lowercaseText = text.toLowerCase();

        // Use available patterns (API or local)
        const patterns = this.entityPatterns.length > 0
            ? this.entityPatterns
            : this.localEntityPatterns.map((p, i) => ({
                id: i,
                entityType: p.entityType,
                pattern: p.pattern,
                priority: p.priority
            }));

        // Extract amount
        if (intentType === 'send_money' || intentType === 'deposit') {
            const amountPattern = patterns.find(p => p.entityType === 'amount');
            if (amountPattern) {
                try {
                    const regex = new RegExp(amountPattern.pattern, 'i');
                    const match = text.match(regex);
                    if (match && match[1]) {
                        const amountStr = match[1].replace(/[$,]/g, '');
                        entities['amount'] = parseFloat(amountStr);
                    }
                } catch (e) {
                    console.error(`Invalid regex pattern for amount: ${amountPattern.pattern}`, e);
                }
            }
        }

        // Extract currency using currency map
        for (const [key, value] of Object.entries(this.currencyMap)) {
            if (lowercaseText.includes(key.toLowerCase())) {
                entities['currency'] = value;
                break;
            }
        }

        // Extract currency code directly
        const currencyCodeMatch = text.match(/\b(USD|EUR|GBP|INR|CAD|AUD|JPY)\b/i);
        if (currencyCodeMatch && currencyCodeMatch[1]) {
            entities['currency'] = currencyCodeMatch[1].toUpperCase();
        }

        // Extract recipient (for send money intent)
        if (intentType === 'send_money') {
            // Try "to [recipient]" pattern first
            const recipientMatch = text.match(/to\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
            if (recipientMatch && recipientMatch[1]) {
                entities['recipient'] = recipientMatch[1].trim();
            } else {
                // Try finding the recipient as the last word
                const words = text.split(/\s+/);
                const lastWord = words[words.length - 1];
                // Make sure it's not a common word like "now" or "today"
                if (lastWord &&
                    !/^(now|today|please|immediately|asap|money|funds|dollars|euros|pounds)$/i.test(lastWord)) {
                    entities['recipient'] = lastWord;
                }
            }
        }

        // For exchange rates, extract currency pairs
        if (intentType === 'check_rates') {
            const rateMatch = text.match(/(\w{3})(?:\s+to\s+|\s+and\s+)(\w{3})/i);
            if (rateMatch && rateMatch[1] && rateMatch[2]) {
                entities['fromCurrency'] = rateMatch[1].toUpperCase();
                entities['toCurrency'] = rateMatch[2].toUpperCase();
            }
        }

        // Extract payment method for deposit
        if (intentType === 'deposit') {
            for (const [key, value] of Object.entries(this.paymentMethodMap)) {
                if (lowercaseText.includes(key.toLowerCase())) {
                    entities['paymentMethod'] = value;
                    break;
                }
            }
        }

        return entities;
    }

    /**
     * Check if we should refresh patterns from the server
     */
    private shouldRefreshPatterns(): boolean {
        const now = Date.now();
        return now - this.lastPatternFetch > this.cacheDuration;
    }

    /**
     * Fetch latest intent and entity patterns from the server
     */
    refreshPatterns(): void {
        // Update last fetch time even if it fails
        this.lastPatternFetch = Date.now();

        // Try to get intent patterns
        this.http.get<IntentPattern[]>(`${this.apiUrl}/intent-patterns`)
            .pipe(
                tap(patterns => {
                    console.log('Fetched intent patterns:', patterns.length);
                    this.intentPatterns = patterns;
                }),
                catchError(err => {
                    console.error('Failed to fetch intent patterns:', err);
                    return of([]);
                })
            )
            .subscribe();

        // Try to get entity patterns
        this.http.get<EntityPattern[]>(`${this.apiUrl}/entity-patterns`)
            .pipe(
                tap(patterns => {
                    console.log('Fetched entity patterns:', patterns.length);
                    this.entityPatterns = patterns;
                }),
                catchError(err => {
                    console.error('Failed to fetch entity patterns:', err);
                    return of([]);
                })
            )
            .subscribe();
    }

    /**
     * Log failed recognitions to improve patterns
     * @param userInput The original user input
     * @param attemptedIntent The intent we attempted to recognize
     * @param confidence The confidence score
     */
    logFailedRecognition(userInput: string, attemptedIntent: string, confidence: number): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/log-failed-recognition`, {
            userInput,
            attemptedIntent,
            confidence
        }).pipe(
            catchError(err => {
                console.error('Failed to log recognition failure:', err);
                return of(void 0);
            })
        );
    }

    /**
     * Log successful intent recognition to improve patterns
     * @param query The original user query
     * @param recognizedIntent The intent that was recognized
     * @param entities Extracted entities
     */
    logSuccessfulRecognition(query: string, recognizedIntent: string, entities: any): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/log-successful-recognition`, {
            query,
            intentType: recognizedIntent,
            extractedEntities: entities
        }).pipe(
            catchError(err => {
                console.error('Failed to log successful recognition:', err);
                return of(void 0);
            })
        );
    }

    /**
     * Get conversation flow step for a given intent and step
     * @param flowType The type of flow (send_money_flow, deposit_flow, etc.)
     * @param stepName The current step in the flow
     * @returns Observable with the prompt template and next steps
     */
    getConversationFlowStep(flowType: string, stepName: string): Observable<ConversationFlowStep> {
        return this.http.get<ConversationFlowStep>(
            `${this.apiUrl}/conversation-flow/${flowType}/${stepName}`
        ).pipe(
            catchError(err => {
                console.error(`Failed to get conversation flow step for ${flowType}/${stepName}:`, err);

                // Return default prompts and flow steps
                return of(this.getDefaultFlowStep(flowType, stepName));
            })
        );
    }

    /**
     * Get default conversation flow step if API fails
     * @param flowType The type of flow
     * @param stepName The current step in the flow
     * @returns Default prompt template and next steps
     */
    private getDefaultFlowStep(flowType: string, stepName: string): ConversationFlowStep {
        // Default flow steps for send money
        if (flowType === 'send_money_flow') {
            switch (stepName) {
                case 'start':
                    return {
                        promptTemplate: "I can help you send money. Who would you like to send money to?",
                        nextSteps: ["recipient_collection", "amount_collection", "currency_selection"]
                    };
                case 'recipient_collection':
                    return {
                        promptTemplate: "Who would you like to send money to?",
                        nextSteps: ["amount_collection", "currency_selection"]
                    };
                case 'amount_collection':
                    return {
                        promptTemplate: "How much would you like to send to {recipient}?",
                        nextSteps: ["currency_selection", "confirm_transaction"]
                    };
                case 'currency_selection':
                    return {
                        promptTemplate: "What currency would you like to send in? (Default is USD)",
                        nextSteps: ["confirm_transaction"]
                    };
                case 'confirm_transaction':
                    return {
                        promptTemplate: "I'll help you send {amount} {currency} to {recipient}. Is that correct?",
                        nextSteps: ["complete_transaction", "edit_transaction"]
                    };
                default:
                    return {
                        promptTemplate: "How can I help you send money today?",
                        nextSteps: ["start"]
                    };
            }
        }

        // Default flow steps for deposit
        if (flowType === 'deposit_flow') {
            switch (stepName) {
                case 'start':
                    return {
                        promptTemplate: "I can help you deposit money. How much would you like to deposit?",
                        nextSteps: ["amount_collection", "currency_selection", "payment_method_selection"]
                    };
                case 'amount_collection':
                    return {
                        promptTemplate: "How much would you like to deposit?",
                        nextSteps: ["currency_selection", "payment_method_selection"]
                    };
                case 'currency_selection':
                    return {
                        promptTemplate: "What currency would you like to deposit? (Default is USD)",
                        nextSteps: ["payment_method_selection", "confirm_deposit"]
                    };
                case 'payment_method_selection':
                    return {
                        promptTemplate: "How would you like to deposit? (card, bank transfer, or digital wallet)",
                        nextSteps: ["confirm_deposit"]
                    };
                case 'confirm_deposit':
                    return {
                        promptTemplate: "I'll help you deposit {amount} {currency} using {payment_method}. Is that correct?",
                        nextSteps: ["complete_deposit", "edit_deposit"]
                    };
                default:
                    return {
                        promptTemplate: "How can I help you deposit money today?",
                        nextSteps: ["start"]
                    };
            }
        }

        // Generic fallback
        return {
            promptTemplate: "How can I help you today?",
            nextSteps: ["start"]
        };
    }

    /**
     * Format a prompt template with entity values
     * @param template The prompt template with placeholders
     * @param entities Entity values to insert
     * @returns Formatted prompt
     */
    formatPromptTemplate(template: string, entities: { [key: string]: any }): string {
        let formattedPrompt = template;

        for (const [key, value] of Object.entries(entities)) {
            const placeholder = `{${key}}`;
            if (formattedPrompt.includes(placeholder)) {
                formattedPrompt = formattedPrompt.replace(placeholder, String(value));
            }
        }

        return formattedPrompt;
    }

    /**
     * Get the next step in the conversation flow
     * @param flowType The current flow type
     * @param currentStep The current step
     * @param nextStepType The type of next step to get
     * @returns The name of the next step
     */
    getNextStep(flowType: string, currentStep: string, nextStepType: string): Observable<string> {
        return this.getConversationFlowStep(flowType, currentStep).pipe(
            map(flowStep => {
                const nextSteps = flowStep.nextSteps;
                if (nextSteps.includes(nextStepType)) {
                    return nextStepType;
                }
                return nextSteps.length > 0 ? nextSteps[0] : 'start';
            })
        );
    }

    /**
     * Normalize strings for better matching
     * @param text Text to normalize
     * @returns Normalized text
     */
    normalizeText(text: string): string {
        // Convert to lowercase
        let normalized = text.toLowerCase();

        // Remove extra whitespace
        normalized = normalized.replace(/\s+/g, ' ').trim();

        // Remove punctuation
        normalized = normalized.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');

        return normalized;
    }

    /**
     * Save a query to the database for improving recognition
     * @param query The user query
     * @param intentType The recognized intent
     * @param entities The extracted entities
     */
    saveQueryToDatabase(query: string, intentType: string, entities: any): Observable<void> {
        return this.http.post<void>(`${this.apiUrl}/save-query`, {
            query,
            intentType,
            entities
        }).pipe(
            catchError(err => {
                console.error('Failed to save query:', err);
                return of(void 0);
            })
        );
    }
}