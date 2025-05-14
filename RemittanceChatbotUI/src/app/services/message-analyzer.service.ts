// message-analyzer.service.ts
import { Injectable } from '@angular/core';

export interface AnalyzedMessage {
    intent: string;
    confidence: number;
    entities: {
        amount?: number;
        recipient?: string;
        currency?: string;
        paymentMethod?: string;
        fromCurrency?: string;
        toCurrency?: string;
    };
    originalText: string;
}

@Injectable({
    providedIn: 'root'
})
export class MessageAnalyzerService {
    // Basic patterns for intent recognition and entity extraction
    private readonly intentPatterns = [
        // Send money patterns
        {
            intent: 'send_money',
            pattern: /(?:send|transfer|remit)\s+(?:(?:\$?\s*)?([0-9]+(?:\.[0-9]+)?))?(?:\s*(?:dollars|euro|pound|usd|eur|gbp)?)?\s+(?:to\s+)?([a-zA-Z]+)/i,
            priority: 10
        },
        {
            intent: 'send_money',
            pattern: /(?:pay)(?:\s+(?:\$?\s*)?([0-9]+(?:\.[0-9]+)?))?(?:\s*(?:dollars|euro|pound|usd|eur|gbp)?)?\s+(?:to\s+)?([a-zA-Z]+)/i,
            priority: 9
        },
        {
            intent: 'send_money',
            pattern: /(?:transfer|remit)(?:\s+(?:\$?\s*)?([0-9]+(?:\.[0-9]+)?))?(?:\s*(?:dollars|euro|pound|usd|eur|gbp)?)?\s+(?:to\s+)?([a-zA-Z]+)/i,
            priority: 9
        },
        {
            intent: 'send_money',
            pattern: /(?:send|transfer)\s+(?:money|funds)?(?:\s+(?:to|for)\s+([a-zA-Z]+))?/i,
            priority: 5
        },

        // Deposit patterns
        {
            intent: 'deposit',
            pattern: /(?:deposit|add\s+money|top\s+up)\s+(?:(?:\$?\s*)?([0-9]+(?:\.[0-9]+)?))?(?:\s*(?:dollars|euro|pound|usd|eur|gbp))?/i,
            priority: 10
        },
        {
            intent: 'deposit',
            pattern: /(?:deposit|add)\s+(?:money|funds)?\s*(?:to my account)?/i,
            priority: 5
        },

        // Check balance patterns
        {
            intent: 'check_balance',
            pattern: /(?:balance|how\s+much|available\s+funds|account\s+balance|what[''']?s\s+my\s+balance)/i,
            priority: 10
        },

        // Exchange rate patterns
        {
            intent: 'check_rates',
            pattern: /(?:rate|exchange|conversion|convert|exchange\s+rate)(?:\s+(?:from|between)?\s*([a-z]{3})?\s*(?:to|and|with)?\s*([a-z]{3})?)?/i,
            priority: 10
        },

        // Help/support patterns
        {
            intent: 'help',
            pattern: /(?:help|support|how to|guide|explain|what can you do|what can i do)/i,
            priority: 5
        },

        // Greeting patterns
        {
            intent: 'greeting',
            pattern: /(?:hello|hi|hey|greetings|howdy)/i,
            priority: 3
        }
    ];

    // Entity extraction patterns
    private currencyMap = {
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

    private paymentMethodMap = {
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

    constructor() { }

    /**
     * Analyze a message to identify intent and extract entities
     * @param message The message to analyze
     * @returns An object containing the identified intent, confidence, and extracted entities
     */
    analyzeMessage(message: string): AnalyzedMessage {
        const lowercaseMessage = message.toLowerCase();
        const result: AnalyzedMessage = {
            intent: 'unknown',
            confidence: 0,
            entities: {},
            originalText: message
        };

        // Find the best matching intent
        let bestMatch = {
            intent: 'unknown',
            confidence: 0,
            pattern: null as RegExp | null
        };

        // Try each pattern
        this.intentPatterns.forEach(pattern => {
            const match = lowercaseMessage.match(pattern.pattern);
            if (match) {
                // Calculate confidence based on match length and pattern priority
                const matchLength = match[0].length;
                const textCoverage = matchLength / lowercaseMessage.length;
                const confidence = textCoverage * (pattern.priority / 10);

                // Check if this is a better match than the current best
                if (confidence > bestMatch.confidence) {
                    bestMatch = {
                        intent: pattern.intent,
                        confidence: confidence,
                        pattern: pattern.pattern
                    };
                }
            }
        });

        // Set the identified intent
        result.intent = bestMatch.intent;
        result.confidence = bestMatch.confidence;

        // Extract entities based on the intent
        this.extractEntities(lowercaseMessage, result);

        return result;
    }

    /**
     * Extract entities from a message based on the identified intent
     * @param message The message to extract entities from
     * @param result The analysis result to populate with entities
     */
    private extractEntities(message: string, result: AnalyzedMessage): void {
        // Extract amount
        const amountMatch = message.match(/\$?([0-9]+(?:\.[0-9]+)?)/);
        if (amountMatch && amountMatch[1]) {
            result.entities.amount = parseFloat(amountMatch[1]);
        }

        // Extract recipient (for send money intent)
        if (result.intent === 'send_money') {
            // Try "to [recipient]" pattern first
            const recipientMatch = message.match(/to\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
            if (recipientMatch && recipientMatch[1]) {
                result.entities.recipient = recipientMatch[1].trim();
            } else {
                // Try finding the recipient as the last word
                const words = message.split(/\s+/);
                const lastWord = words[words.length - 1];
                // Make sure it's not a common word like "now" or "today"
                if (lastWord && !/^(now|today|please|immediately|asap|money|funds|dollars|euros|pounds)$/i.test(lastWord)) {
                    result.entities.recipient = lastWord;
                }
            }
        }

        // Extract currency
        Object.keys(this.currencyMap).forEach(keyword => {
            if (message.includes(keyword.toLowerCase())) {
                result.entities.currency = this.currencyMap[keyword as keyof typeof this.currencyMap];
            }
        });

        // Parse currency codes
        const currencyCodeMatch = message.match(/\b(USD|EUR|GBP|INR|CAD|AUD|JPY)\b/i);
        if (currencyCodeMatch && currencyCodeMatch[1]) {
            result.entities.currency = currencyCodeMatch[1].toUpperCase();
        }

        // For exchange rates, extract currency pairs
        if (result.intent === 'check_rates') {
            const currencyPairMatch = message.match(/\b([A-Z]{3})\b.*\b([A-Z]{3})\b/i);
            if (currencyPairMatch && currencyPairMatch[1] && currencyPairMatch[2]) {
                result.entities.fromCurrency = currencyPairMatch[1].toUpperCase();
                result.entities.toCurrency = currencyPairMatch[2].toUpperCase();
            }
        }

        // Extract payment method for deposit
        if (result.intent === 'deposit') {
            Object.keys(this.paymentMethodMap).forEach(keyword => {
                if (message.includes(keyword.toLowerCase())) {
                    result.entities.paymentMethod = this.paymentMethodMap[keyword as keyof typeof this.paymentMethodMap];
                }
            });
        }
    }

    /**
     * Check if a message matches a specific intent
     * @param message The message to check
     * @param intent The intent to check for
     * @returns True if the message matches the intent, false otherwise
     */
    matchesIntent(message: string, intent: string): boolean {
        const analysis = this.analyzeMessage(message);
        return analysis.intent === intent && analysis.confidence > 0.3;
    }

    /**
     * Refine analysis results for a specific intent
     * @param message The original message
     * @param intent The specific intent to analyze for
     * @returns Refined analysis result focused on the specified intent
     */
    refineAnalysis(message: string, intent: string): AnalyzedMessage {
        const lowercaseMessage = message.toLowerCase();
        const result: AnalyzedMessage = {
            intent,
            confidence: 0,
            entities: {},
            originalText: message
        };

        // Find the specific patterns for this intent
        const intentPatterns = this.intentPatterns.filter(p => p.intent === intent);

        let bestMatch = {
            confidence: 0,
            pattern: null as RegExp | null
        };

        // Try each pattern
        intentPatterns.forEach(pattern => {
            const match = lowercaseMessage.match(pattern.pattern);
            if (match) {
                // Calculate confidence
                const matchLength = match[0].length;
                const textCoverage = matchLength / lowercaseMessage.length;
                const confidence = textCoverage * (pattern.priority / 10);

                // Check if this is a better match
                if (confidence > bestMatch.confidence) {
                    bestMatch = {
                        confidence,
                        pattern: pattern.pattern
                    };
                }
            }
        });

        // Set confidence
        result.confidence = bestMatch.confidence;

        // Extract entities specific to this intent
        this.extractEntities(lowercaseMessage, result);

        return result;
    }

    /**
     * Generate a natural language response based on the analysis
     * @param analysis The analysis result
     * @returns A natural language response
     */
    generateResponse(analysis: AnalyzedMessage): string {
        switch (analysis.intent) {
            case 'greeting':
                return 'Hello! How can I help you with your money transfers today?';

            case 'send_money':
                const amount = analysis.entities.amount ? `$${analysis.entities.amount}` : 'money';
                const recipient = analysis.entities.recipient || 'someone';
                const currency = analysis.entities.currency || 'USD';
                return `I can help you send ${amount} ${currency !== 'USD' ? currency : ''} to ${recipient}. Would you like to proceed?`;

            case 'deposit':
                const depositAmount = analysis.entities.amount ? `$${analysis.entities.amount}` : 'money';
                const depositCurrency = analysis.entities.currency || 'USD';
                return `I can help you deposit ${depositAmount} ${depositCurrency !== 'USD' ? depositCurrency : ''} to your account. Would you like to proceed?`;

            case 'check_balance':
                return 'I can check your current balance for you. Would you like me to do that?';

            case 'check_rates':
                const fromCurrency = analysis.entities.fromCurrency || 'USD';
                const toCurrency = analysis.entities.toCurrency || 'EUR';
                return `I can check the current exchange rate from ${fromCurrency} to ${toCurrency} for you. Would you like me to do that?`;

            case 'help':
                return 'I can help you send money, deposit funds, check your balance, and get exchange rates. What would you like to do?';

            case 'unknown':
            default:
                return "I'm not sure I understand. Could you rephrase or tell me if you want to send money, deposit funds, check your balance, or get exchange rates?";
        }
    }
}