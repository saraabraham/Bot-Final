// In app-routing.module.ts
// Update the router configuration to use better navigation strategy

import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChatComponent } from './components/chat/chat.component';
import { RemittanceFormComponent } from './components/remittance-form/remittance-form.component';
import { LoginComponent } from './components/login/login.component';
import { AuthGuard } from './services/auth.guard';
import { TransactionConfirmationComponent } from './components/transaction-confirmation/transaction-confirmation.component';
import { DepositFormComponent } from './components/deposit-form/deposit-form.component';
import { ExchangeRateComponent } from './components/exchange-rate/exchange-rate.component';

export const routes: Routes = [
    {
        path: '',
        redirectTo: '/chat',
        pathMatch: 'full'
    },
    {
        path: 'login',
        component: LoginComponent
    },
    {
        path: 'chat',
        component: ChatComponent,
        canActivate: [AuthGuard],
        // Add this to help preserve component state
        data: { reuse: true }
    },
    {
        path: 'send-money',
        component: RemittanceFormComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'deposit',
        component: DepositFormComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'exchange-rates',
        component: ExchangeRateComponent
    },
    {
        path: 'transaction-confirmation/:id',
        component: TransactionConfirmationComponent,
        canActivate: [AuthGuard]
    },
    {
        path: '**',
        redirectTo: '/chat'
    }
];

@NgModule({
    imports: [
        RouterModule.forRoot(routes, {
            enableTracing: false, // Set to false for production
            // Add these options to help preserve navigation state
            onSameUrlNavigation: 'reload',
            scrollPositionRestoration: 'enabled'
        })
    ],
    exports: [RouterModule]
})
export class AppRoutingModule { }