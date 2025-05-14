import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { VoiceRecognitionService } from '../../services/voice-recognition.service';
import { ChatService } from '../../services/chat.service';

@Component({
    selector: 'app-voice-input',
    templateUrl: './voice-input.component.html',
    styleUrls: ['./voice-input.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush // Add OnPush for better performance
})
export class VoiceInputComponent implements OnInit, OnDestroy {
    @Output() resultProcessed = new EventEmitter<void>();

    isListening = false;
    transcript = '';
    microphoneSupported = true;
    errorMessage = '';
    processingAudio = false;

    private destroy$ = new Subject<void>();

    constructor(
        private voiceService: VoiceRecognitionService,
        private chatService: ChatService,
        private cdRef: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        // Check browser support once on initialization
        this.checkBrowserSupport();

        // Set up subscriptions
        this.setupSubscriptions();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    private checkBrowserSupport(): void {
        const SpeechRecognition = (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        this.microphoneSupported = !!SpeechRecognition;
        this.cdRef.markForCheck();
    }

    private setupSubscriptions(): void {
        // Subscribe to voice recognition status
        this.voiceService.isListening$
            .pipe(takeUntil(this.destroy$))
            .subscribe(isListening => {
                this.isListening = isListening;

                // If stopped listening but have a transcript, process it
                if (!isListening && this.transcript && !this.processingAudio) {
                    this.processVoiceInput();
                }

                this.cdRef.markForCheck();
            });

        // Subscribe to voice transcripts
        this.voiceService.transcript$
            .pipe(takeUntil(this.destroy$))
            .subscribe(transcript => {
                if (transcript) {
                    this.transcript = transcript;
                    // Force UI update
                    this.cdRef.markForCheck();
                }
            });

        // Subscribe to voice recognition errors
        this.voiceService.error$
            .pipe(takeUntil(this.destroy$))
            .subscribe(error => {
                if (error) {
                    this.errorMessage = error;
                    this.cdRef.markForCheck();
                }
            });
    }

    toggleVoiceRecognition(): void {
        if (!this.microphoneSupported) {
            return;
        }

        if (this.isListening) {
            this.voiceService.stop();
        } else {
            this.errorMessage = '';
            this.transcript = '';
            this.voiceService.start();
        }
    }

    processVoiceInput(): void {
        if (!this.transcript) {
            return;
        }

        this.processingAudio = true;
        this.cdRef.markForCheck();

        const audioBlob = this.voiceService.getAudioBlob();

        if (audioBlob) {
            this.chatService.processVoiceInput(audioBlob).subscribe({
                next: (command) => {
                    console.log('Voice command processed:', command);
                    this.processingAudio = false;
                    this.resultProcessed.emit();
                    this.cdRef.markForCheck();
                },
                error: (error) => {
                    console.error('Error processing voice command:', error);
                    this.errorMessage = 'Failed to process voice input. Please try again.';
                    this.processingAudio = false;
                    this.cdRef.markForCheck();
                }
            });
        } else {
            // If we have transcript but no blob (rare edge case)
            this.chatService.sendMessage(this.transcript).subscribe({
                next: () => {
                    this.resultProcessed.emit();
                },
                error: (error) => {
                    console.error('Error sending voice transcript:', error);
                    this.errorMessage = 'Failed to send voice message. Please try again.';
                    this.cdRef.markForCheck();
                }
            });
        }

        // Clear the transcript after processing
        this.voiceService.clearTranscript();
        this.transcript = '';
    }

    cancelVoiceInput(): void {
        if (this.isListening) {
            this.voiceService.stop();
        }
        this.transcript = '';
        this.voiceService.clearTranscript();
        this.resultProcessed.emit();
    }
}