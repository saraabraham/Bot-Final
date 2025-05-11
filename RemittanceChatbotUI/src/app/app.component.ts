// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  isAuthenticated = false;

  constructor(private authService: AuthService) { }

  ngOnInit() {
    // Subscribe to authentication status
    this.authService.currentUser$.subscribe(user => {
      this.isAuthenticated = !!user?.isAuthenticated;
    });
  }

  logout() {
    this.authService.logout();
  }
}