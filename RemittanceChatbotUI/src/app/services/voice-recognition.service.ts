// Update voice-recognition.service.ts

import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionResultList {
    [index: number]: SpeechRecognitionResult;
    length: number;
}

interface SpeechRecognitionResult {
    [index: number]: SpeechRecognitionAlternative;
    length: number;
    isFinal: boolean;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

@Injectable({
    providedIn: 'root'
})
export class VoiceRecognitionService {
    private recognition: any;
    private isListening = new BehaviorSubject<boolean>(false);
    public isListening$ = this.isListening.asObservable();
    private transcript = new BehaviorSubject<string>('');
    public transcript$ = this.transcript.asObservable();
    private audioBlob: Blob | null = null;
    private mediaRecorder: any;
    private audioChunks: BlobPart[] = [];
    private isBrowser: boolean;

    // Add list of finance-related keywords to improve recognition accuracy
    private financeKeywords = [
        'send', 'transfer', 'remit', 'money', 'dollars', 'euros', 'pounds',
        'balance', 'recipient', 'account', 'bank', 'currency',
        'USD', 'EUR', 'GBP', 'rate', 'exchange', 'fee'
    ];

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {
        this.isBrowser = isPlatformBrowser(this.platformId);
        // Only initialize recognition in browser environment
        if (this.isBrowser) {
            this.initRecognition();
        }
    }

    private initRecognition(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        // Check if browser supports SpeechRecognition
        const SpeechRecognition = (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Speech recognition not supported in this browser');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;

        // Add language model settings if available on the browser
        try {
            if ((this.recognition as any).lang !== undefined) {
                (this.recognition as any).lang = 'en-US';
            }

            // Some browsers support grammars for better recognition
            if ('SpeechGrammarList' in window || ('webkitSpeechGrammarList' in window)) {
                const SpeechGrammarList = (window as any).SpeechGrammarList ||
                    (window as any).webkitSpeechGrammarList;

                const grammarList = new SpeechGrammarList();

                // Create a simple grammar for finance-related commands
                // Format: 'send $AMOUNT to $NAME', 'check balance', etc.
                const grammar = `#JSGF V1.0; grammar finance; public <command> = send <amount> (dollars | euros | pounds) to <n> | check (balance | rates);`;

                grammarList.addFromString(grammar, 1);
                this.recognition.grammars = grammarList;
            }
        } catch (e) {
            console.warn('Advanced speech recognition features not supported', e);
        }

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
            const current = event.resultIndex;
            const currentTranscript = event.results[current][0].transcript;

            // Check if this is one of our finance keywords for better accuracy
            const normalized = this.normalizeTranscript(currentTranscript);

            if (event.results[current].isFinal) {
                this.transcript.next(normalized);
            }
        };

        this.recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event);
            this.stop();
        };

        this.recognition.onend = () => {
            this.isListening.next(false);
        };
    }

    // Helper to normalize transcript and improve money transfer command recognition
    private normalizeTranscript(text: string): string {
        // Common speech recognition issues with finance terms
        const corrections: { [key: string]: string } = {
            'center': 'send',
            'scent': 'send',
            'sent': 'send',
            'saint': 'send',
            'dolors': 'dollars',
            'dollar': 'dollars',
            'euro': 'euros',
            'pound': 'pounds',
            'balanced': 'balance',
            'check my bounds': 'check my balance',
            'recipience': 'recipient',
            'recipients': 'recipient'
        };

        // Apply corrections
        let normalized = text.toLowerCase();

        Object.keys(corrections).forEach(incorrect => {
            const regex = new RegExp(`\\b${incorrect}\\b`, 'gi');
            normalized = normalized.replace(regex, corrections[incorrect]);
        });

        // Fix amounts: "one hundred" -> "100", "five hundred" -> "500", etc.
        const numberWords: { [key: string]: string } = {
            'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
            'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
            'twenty': '20', 'thirty': '30', 'forty': '40', 'fifty': '50',
            'sixty': '60', 'seventy': '70', 'eighty': '80', 'ninety': '90',
            'hundred': '00', 'thousand': '000'
        };

        // Replace number words with digits in specific patterns
        Object.keys(numberWords).forEach(word => {
            // Only replace if followed by "dollars", "euros", etc.
            const regex = new RegExp(`\\b${word}\\s+(dollars|euros|pounds)\\b`, 'gi');
            normalized = normalized.replace(regex, `${numberWords[word]} $1`);

            // Handle compound numbers like "one hundred", "five hundred"
            if (word === 'hundred' || word === 'thousand') {
                Object.keys(numberWords).forEach(digit => {
                    if (digit !== 'hundred' && digit !== 'thousand') {
                        const compoundRegex = new RegExp(`\\b${digit}\\s+${word}\\b`, 'gi');
                        const replacement = word === 'hundred'
                            ? `${numberWords[digit]}00`
                            : `${numberWords[digit]}000`;
                        normalized = normalized.replace(compoundRegex, replacement);
                    }
                });
            }
        });

        // Look for "send money to [name]" patterns
        const sendMoneyMatch = normalized.match(/send\s+money\s+to\s+(\w+)/i);
        if (sendMoneyMatch) {
            // Default to $100 if no amount specified
            normalized = `send 100 dollars to ${sendMoneyMatch[1]}`;
        }

        return normalized;
    }

    start(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        if (!this.recognition) {
            this.initRecognition();
            if (!this.recognition) return;
        }

        this.transcript.next('');
        this.audioChunks = [];
        this.recognition.start();
        this.isListening.next(true);

        // Set up audio recording for STT API
        this.startAudioRecording();
    }

    stop(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        if (this.recognition) {
            this.recognition.stop();
            this.isListening.next(false);
            this.stopAudioRecording();
        }
    }

    private startAudioRecording(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        // Set up MediaRecorder for capturing audio for backend STT processing
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.mediaRecorder = new MediaRecorder(stream);

                this.mediaRecorder.addEventListener('dataavailable', (event: any) => {
                    this.audioChunks.push(event.data);
                });

                this.mediaRecorder.addEventListener('stop', () => {
                    this.audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                    // Release media stream tracks
                    stream.getTracks().forEach(track => track.stop());
                });

                this.mediaRecorder.start();
            })
            .catch(error => {
                console.error('Error accessing microphone:', error);
            });
    }

    private stopAudioRecording(): void {
        // Skip if not in browser environment
        if (!this.isBrowser) return;

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    getAudioBlob(): Blob | null {
        return this.audioBlob;
    }

    clearTranscript(): void {
        this.transcript.next('');
    }
}