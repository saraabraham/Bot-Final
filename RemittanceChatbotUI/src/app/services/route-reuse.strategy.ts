// src/app/services/route-reuse.strategy.ts
// This class implements a custom route reuse strategy to maintain component state

import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

export class CustomRouteReuseStrategy implements RouteReuseStrategy {
    private storedRoutes = new Map<string, DetachedRouteHandle>();

    // Determines if the route should be detached for later reuse
    shouldDetach(route: ActivatedRouteSnapshot): boolean {
        // Only detach routes marked for reuse
        return route.data?.['reuse'] === true;
    }

    // Store the detached route
    store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): void {
        const id = this.getRouteId(route);
        if (id) {
            this.storedRoutes.set(id, handle);
        }
    }

    // Determines if the route should be reattached
    shouldAttach(route: ActivatedRouteSnapshot): boolean {
        const id = this.getRouteId(route);
        return !!id && !!this.storedRoutes.get(id);
    }

    // Retrieves the previously stored route
    retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
        const id = this.getRouteId(route);
        if (!id) {
            return null;
        }
        return this.storedRoutes.get(id) || null;
    }

    // Determines if the same route should be reused
    shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
        // Default behavior - reuse the route if the path is the same
        return future.routeConfig === curr.routeConfig;
    }

    // Helper method to get a unique identifier for the route
    private getRouteId(route: ActivatedRouteSnapshot): string | null {
        // Only generate IDs for routes that should be reused
        if (route.data?.['reuse'] !== true) {
            return null;
        }

        // Use the route path as ID
        const path = route.routeConfig?.path;
        return path ? `${path}` : null;
    }
}