// In app.config.ts
// Update to include the custom route reuse strategy

import { ApplicationConfig } from '@angular/core';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app-routing.module';
import { jwtInterceptor } from './services/jwt.interceptor';
import { CustomRouteReuseStrategy } from './services/route-reuse.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([jwtInterceptor])),
    provideAnimations(),
    { provide: RouteReuseStrategy, useClass: CustomRouteReuseStrategy }
  ]
};