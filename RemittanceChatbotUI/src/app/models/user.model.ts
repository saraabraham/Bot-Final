export interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    savedRecipients?: string[];
    preferredCurrency?: string;
    isAuthenticated: boolean;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    id: string;
    name: string;
    email: string;
    token: string;
    phone?: string;
    preferredCurrency: string;
    isAuthenticated: boolean;
}