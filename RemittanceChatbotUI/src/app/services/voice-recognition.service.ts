// Complete VoiceRecognitionService with all methods and properties

import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class VoiceRecognitionService {
    private recognition: any;
    private isListeningSubject = new BehaviorSubject<boolean>(false);
    public isListening$ = this.isListeningSubject.asObservable();
    private transcriptSubject = new BehaviorSubject<string>('');
    public transcript$ = this.transcriptSubject.asObservable();
    private audioBlob: Blob | null = null;
    private mediaRecorder: any;
    private audioChunks: BlobPart[] = [];
    private isBrowser: boolean;
    private stream: MediaStream | null = null;

    // Add a flag to track if we've initialized the recognition API
    private recognitionInitialized = false;
    // Add an error subject to track errors
    private errorSubject = new Subject<string>();
    public error$ = this.errorSubject.asObservable();

    // Enhanced properties for better capture
    private finalTranscript = '';
    private interimTranscript = '';
    private isProcessing = false;

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {
        this.isBrowser = isPlatformBrowser(this.platformId);
        console.log('VoiceRecognitionService initialized, browser environment:', this.isBrowser);

        // Initialize recognition on service creation if in browser
        if (this.isBrowser) {
            this.initRecognition();
        }
    }

    private initRecognition(): void {
        // Skip if not in browser environment or already initialized
        if (!this.isBrowser || this.recognitionInitialized) return;

        // Check if browser supports SpeechRecognition
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('Speech recognition not supported in this browser');
            this.errorSubject.next('Speech recognition not supported in this browser');
            return;
        }

        console.log('Speech recognition is supported!');

        try {
            this.recognition = new SpeechRecognition();

            // CRITICAL: Enhanced settings for better capture
            this.recognition.continuous = true; // Keep listening for longer phrases
            this.recognition.interimResults = true; // Get partial results
            this.recognition.maxAlternatives = 3; // Get multiple alternatives
            this.recognition.lang = 'en-US';

            // Add timeout settings
            this.recognition.speechTimeout = 10000; // 10 seconds
            this.recognition.speechTimeoutBuffered = 2000; // 2 seconds buffer
            this.recognition.maxSpeechTime = 15000; // 15 seconds max

            this.recognition.onstart = () => {
                console.log('Speech recognition started');
                this.isListeningSubject.next(true);
                this.finalTranscript = '';
                this.interimTranscript = '';
                this.isProcessing = false;
            };

            this.recognition.onresult = (event: any) => {
                console.log('Recognition result event:', event);

                // Process all results to capture the complete command
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    const transcript = result[0].transcript;

                    if (result.isFinal) {
                        finalTranscript += transcript + ' ';
                        console.log('Final transcript segment:', transcript);
                    } else {
                        interimTranscript += transcript + ' ';
                        console.log('Interim transcript segment:', transcript);
                    }
                }

                // Update the complete transcript
                this.finalTranscript += finalTranscript;
                this.interimTranscript = interimTranscript;

                // Combine final and interim transcripts for real-time feedback
                const completeTranscript = (this.finalTranscript + this.interimTranscript).trim();

                console.log('Complete transcript so far:', completeTranscript);

                // Update the transcript subject with the complete text
                this.transcriptSubject.next(completeTranscript);

                // If we have a final result and it looks complete, we can process it
                if (finalTranscript.trim()) {
                    const fullCommand = this.finalTranscript.trim();
                    console.log('Full command captured:', fullCommand);

                    // Check if the command seems complete (has key elements)
                    if (this.isCommandComplete(fullCommand)) {
                        console.log('Command appears complete, will process after speech ends');
                    }
                }
            };

            this.recognition.onspeechend = () => {
                console.log('Speech ended');
                // Small delay to ensure all results are processed
                setTimeout(() => {
                    if (!this.isProcessing) {
                        const finalCommand = this.finalTranscript.trim();
                        if (finalCommand) {
                            console.log('Processing final command:', finalCommand);
                            this.transcriptSubject.next(finalCommand);
                        }
                    }
                }, 500);
            };

            this.recognition.onerror = (event: any) => {
                console.error('Speech recognition error', event);

                // Provide more specific error messages
                if (event.error === 'no-speech') {
                    this.errorSubject.next("No speech was detected. Please try again and speak more clearly.");
                } else if (event.error === 'aborted') {
                    this.errorSubject.next("Speech recognition was aborted.");
                } else if (event.error === 'network') {
                    this.errorSubject.next("Network error occurred. Please check your connection.");
                } else if (event.error === 'not-allowed') {
                    this.errorSubject.next("Microphone access denied. Please enable microphone permissions.");
                } else if (event.error === 'audio-capture') {
                    this.errorSubject.next("Audio capture failed. Please check your microphone.");
                } else {
                    this.errorSubject.next(`Speech recognition error: ${event.error}`);
                }

                this.isListeningSubject.next(false);
            };

            this.recognition.onend = () => {
                console.log('Speech recognition ended');
                this.isListeningSubject.next(false);

                // Process the final transcript if we haven't already
                if (!this.isProcessing && this.finalTranscript.trim()) {
                    console.log('Final processing of transcript:', this.finalTranscript.trim());
                    this.transcriptSubject.next(this.finalTranscript.trim());
                }
            };

            this.recognitionInitialized = true;
        } catch (error) {
            console.error('Error initializing speech recognition:', error);
            this.errorSubject.next('Failed to initialize speech recognition');
        }
    }

    // Helper method to check if a command appears complete
    private isCommandComplete(command: string): boolean {
        const lowerCommand = command.toLowerCase();

        // Check for common complete command patterns
        const completePatterns = [
            /send\s+.*\s+to\s+\w+/,  // "send $10 to John"
            /transfer\s+.*\s+to\s+\w+/, // "transfer money to John"
            /deposit\s+\$?\d+/, // "deposit $100"
            /check\s+balance/, // "check balance"
            /exchange\s+rate/, // "exchange rate"
            /show\s+recipients/, // "show recipients"
        ];

        return completePatterns.some(pattern => pattern.test(lowerCommand));
    }

    public async start(): Promise<void> {
        console.log('Starting voice recognition...');

        // Skip if not in browser environment
        if (!this.isBrowser) {
            console.warn('Not in browser environment, cannot start voice recognition');
            return;
        }

        // Reset state
        this.transcriptSubject.next('');
        this.audioChunks = [];
        this.audioBlob = null;
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.isProcessing = false;

        // IMMEDIATELY emit the listening state for UI feedback
        this.isListeningSubject.next(true);

        try {
            // Request microphone permission with enhanced settings
            console.log('Requesting microphone permission...');
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100,
                    channelCount: 1
                }
            });
            console.log('Microphone permission granted!', this.stream);

            // Start recording and recognition immediately
            this.startAudioRecording(this.stream);

            if (this.recognition) {
                try {
                    // Try to start recognition with retry logic
                    this.recognition.start();
                    console.log('Speech recognition started successfully');
                } catch (e) {
                    console.error('Error starting speech recognition:', e);

                    // If recognition is already started, recreate it
                    if (e instanceof DOMException && e.name === 'InvalidStateError') {
                        console.log('Recognition was already running, restarting...');
                        this.recognitionInitialized = false;
                        this.initRecognition();
                        setTimeout(() => {
                            this.recognition?.start();
                        }, 100);
                    }
                }
            } else {
                console.error('Speech recognition not initialized');
                this.initRecognition();
                if (this.recognition) {
                    console.log('Initialized recognition, starting...');
                    setTimeout(() => {
                        this.recognition.start();
                    }, 100);
                }
            }
        } catch (err) {
            console.error('Error starting voice recognition:', err);

            // If there's an error, make sure to reset the listening state
            this.isListeningSubject.next(false);

            // Emit specific error
            if (err instanceof DOMException && err.name === 'NotAllowedError') {
                this.errorSubject.next('Microphone access denied. Please enable microphone permissions.');
            } else {
                this.errorSubject.next('Failed to start voice recognition.');
            }
        }
    }

    public stop(): void {
        console.log('Stopping voice recognition...');

        // Skip if not in browser environment
        if (!this.isBrowser) return;

        this.isProcessing = true; // Prevent further processing

        try {
            if (this.recognition) {
                this.recognition.stop();
            }
        } catch (e) {
            console.error('Error stopping recognition:', e);
        }

        this.stopAudioRecording();
        this.isListeningSubject.next(false);

        // Stop and release the media stream immediately
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // Ensure final transcript is available
        setTimeout(() => {
            if (this.finalTranscript.trim()) {
                console.log('Emitting final transcript on stop:', this.finalTranscript.trim());
                this.transcriptSubject.next(this.finalTranscript.trim());
            }
        }, 100);
    }

    private startAudioRecording(stream: MediaStream): void {
        console.log('Starting audio recording...');

        try {
            // Set options for better audio quality
            const options = {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            };

            // Check if mime type is supported
            if (MediaRecorder.isTypeSupported(options.mimeType)) {
                this.mediaRecorder = new MediaRecorder(stream, options);
            } else {
                // Fallback
                this.mediaRecorder = new MediaRecorder(stream);
            }

            this.mediaRecorder.addEventListener('dataavailable', (event: any) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            });

            this.mediaRecorder.addEventListener('stop', () => {
                console.log('Audio recording stopped, creating blob...');
                this.audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                console.log('Audio blob created:', this.audioBlob);
            });

            this.mediaRecorder.start();
            console.log('Audio recording started!');
        } catch (err) {
            console.error('Error starting audio recording:', err);
            this.errorSubject.next('Failed to start audio recording');
        }
    }

    private stopAudioRecording(): void {
        console.log('Stopping audio recording...');

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try {
                this.mediaRecorder.stop();
            } catch (e) {
                console.error('Error stopping media recorder:', e);
            }
        }
    }

    public getAudioBlob(): Blob | null {
        return this.audioBlob;
    }

    public clearTranscript(): void {
        this.transcriptSubject.next('');
        this.finalTranscript = '';
        this.interimTranscript = '';
    }

    // Add a reset method to clear all state
    public reset(): void {
        this.transcriptSubject.next('');
        this.audioChunks = [];
        this.audioBlob = null;
        this.isListeningSubject.next(false);
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.isProcessing = false;

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    // Get the final transcript (useful for debugging and chat component)
    public getFinalTranscript(): string {
        return this.finalTranscript.trim();
    }

    // Get the current transcript (combines final + interim)
    public getCurrentTranscript(): string {
        return (this.finalTranscript + this.interimTranscript).trim();
    }

    // Check if voice recognition is currently processing
    public isCurrentlyListening(): boolean {
        return this.isListeningSubject.value;
    }

    // Get the last captured command for debugging
    public getLastCommand(): string {
        return this.finalTranscript.trim();
    }
}