import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChatComponent } from './components/chat/chat.component';
import { RemittanceFormComponent } from './components/remittance-form/remittance-form.component';
import { LoginComponent } from './components/login/login.component';
import { AuthGuard } from './services/auth.guard';

export const routes: Routes = [  // Add export here
    { path: '', redirectTo: '/chat', pathMatch: 'full' }, // Redirect root to chat
    { path: 'login', component: LoginComponent },
    { path: 'chat', component: ChatComponent, canActivate: [AuthGuard] },
    { path: 'send-money', component: RemittanceFormComponent, canActivate: [AuthGuard] },
    { path: '**', redirectTo: '/chat' } // Redirect unknown paths to chat
];

@NgModule({
    imports: [RouterModule.forRoot(routes, { enableTracing: true })], // Enable tracing for debugging
    exports: [RouterModule]
})
export class AppRoutingModule { }