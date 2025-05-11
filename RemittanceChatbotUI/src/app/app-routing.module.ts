import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChatComponent } from './components/chat/chat.component';
import { RemittanceFormComponent } from './components/remittance-form/remittance-form.component';
import { LoginComponent } from './components/login/login.component';
import { AuthGuard } from './services/auth.guard';

export const routes: Routes = [  // Add export here
    { path: '', component: ChatComponent },
    { path: 'send-money', component: RemittanceFormComponent, canActivate: [AuthGuard] },
    { path: 'login', component: LoginComponent },
    // Redirect to home for any other routes
    { path: '**', redirectTo: '' }
];

@NgModule({
    imports: [RouterModule.forRoot(routes)],
    exports: [RouterModule]
})
export class AppRoutingModule { }