// Updated VoiceRecognitionService with getValue() method

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

    // Changed to expose BehaviorSubject directly with getValue() method
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

    // Add minimum listening duration (milliseconds)
    private minListeningDuration = 3000; // 3 seconds
    private startListeningTime = 0;
    private silenceTimeout: any = null;
    private processingTranscript = false;

    // Add a flag to control whether to update input field
    private shouldUpdateInputField = false;

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {
        this.isBrowser = isPlatformBrowser(this.platformId);
        console.log('VoiceRecognitionService initialized, browser environment:', this.isBrowser);

        // Initialize recognition on service creation if in browser
        if (this.isBrowser) {
            this.initRecognition();
        }
    }

    // Add method to get current transcript value
    public getTranscript(): string {
        return this.transcriptSubject.getValue();
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
            this.recognition.continuous = true; // Changed to true for longer listening
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                console.log('Speech recognition started');
                this.isListeningSubject.next(true);
                this.startListeningTime = Date.now();
                this.processingTranscript = false;
            };

            this.recognition.onresult = (event: any) => {
                // Using requestAnimationFrame for smoother UI updates
                requestAnimationFrame(() => {
                    const current = event.resultIndex;
                    const transcript = event.results[current][0].transcript;

                    // Only update if we're not processing an existing transcript
                    if (!this.processingTranscript) {
                        // Update transcript for UI
                        this.transcriptSubject.next(transcript);
                    }

                    // Reset silence timeout for continuous listening
                    if (this.silenceTimeout) {
                        clearTimeout(this.silenceTimeout);
                    }

                    // Set a new timeout for detecting silence
                    this.silenceTimeout = setTimeout(() => {
                        // Only auto-stop if minimum duration has passed and transcript non-empty
                        const currentDuration = Date.now() - this.startListeningTime;

                        if (currentDuration > this.minListeningDuration && transcript.trim().length > 0) {
                            console.log(`Silence detected after ${currentDuration}ms of listening. Final transcript: "${transcript}"`);
                            this.processingTranscript = true;
                            this.stop();
                        }
                    }, 1500); // 1.5 seconds of silence before auto-stopping

                    // Log final results only
                    if (event.results[current].isFinal) {
                        console.log('Final result:', transcript);
                    }
                });
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
                } else {
                    this.errorSubject.next(`Speech recognition error: ${event.error}`);
                }

                this.isListeningSubject.next(false);
            };

            this.recognition.onend = () => {
                console.log('Speech recognition ended');
                this.isListeningSubject.next(false);

                // If we have a transcript but haven't been listening for minimum time,
                // restart recognition unless we're processing the transcript
                const currentDuration = Date.now() - this.startListeningTime;
                const hasTranscript = this.transcriptSubject.getValue().trim().length > 0;

                if (currentDuration < this.minListeningDuration && hasTranscript && !this.processingTranscript) {
                    console.log('Recognition ended too early, restarting...');
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.error('Error restarting recognition:', e);
                    }
                }
            };

            this.recognitionInitialized = true;
        } catch (error) {
            console.error('Error initializing speech recognition:', error);
            this.errorSubject.next('Failed to initialize speech recognition');
        }
    }

    public async start(updateInputField = false): Promise<void> {
        console.log('Starting voice recognition...');

        // Skip if not in browser environment
        if (!this.isBrowser) {
            console.warn('Not in browser environment, cannot start voice recognition');
            return;
        }

        // Save whether to update input field
        this.shouldUpdateInputField = updateInputField;

        // Reset state
        this.transcriptSubject.next('');
        this.audioChunks = [];
        this.audioBlob = null;
        this.processingTranscript = false;

        // IMMEDIATELY emit the listening state for UI feedback
        this.isListeningSubject.next(true);

        try {
            // Request microphone permission
            console.log('Requesting microphone permission...');
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            console.log('Microphone permission granted!', this.stream);

            // Start recording and recognition immediately
            this.startAudioRecording(this.stream);

            if (this.recognition) {
                try {
                    // Try to start recognition
                    this.recognition.start();
                } catch (e) {
                    console.error('Error starting speech recognition:', e);

                    // If recognition is already started, recreate it
                    if (e instanceof DOMException && e.name === 'InvalidStateError') {
                        console.log('Recognition was already running, restarting...');
                        this.recognitionInitialized = false;
                        this.initRecognition();
                        setTimeout(() => {
                            this.recognition?.start();
                        }, 10); // Minimal timeout to avoid browser issues
                    }
                }
            } else {
                console.error('Speech recognition not initialized');
                this.initRecognition();
                if (this.recognition) {
                    console.log('Initialized recognition, starting...');
                    this.recognition.start();
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

        // Clear silence timeout if it exists
        if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
        }

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
    }

    // Add method to check if transcript should update input field
    public shouldUpdateInput(): boolean {
        return this.shouldUpdateInputField;
    }

    // Add a reset method to clear all state
    public reset(): void {
        this.transcriptSubject.next('');
        this.audioChunks = [];
        this.audioBlob = null;
        this.isListeningSubject.next(false);
        this.processingTranscript = false;

        if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
}