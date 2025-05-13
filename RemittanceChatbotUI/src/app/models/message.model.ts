// Update message.model.ts

export enum MessageSender {
    USER = 'user',
    BOT = 'bot'
}

export interface ChatMessage {
    id: string;
    text: string;
    sender: MessageSender;
    timestamp: Date;
    isProcessing?: boolean;
    actions?: MessageAction[]; // Added for interactive buttons
}

// New interface for message actions
export interface MessageAction {
    text: string;
    action: () => void;
}

export interface BotCommand {
    intent: string;
    entities: { [key: string]: any };
    confidence: number;
    text?: string;
}