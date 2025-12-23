/**
 * Application Routing and Navigation System
 * 
 * Provides client-side routing and navigation for the Indoor Golf Scheduler application.
 * Manages URL state, navigation history, and view transitions.
 */

import { applicationState, ApplicationView } from '../state/ApplicationState';
import { errorHandler } from '../utils/ErrorHandler';

export interface Route {
  path: string;
  view: ApplicationView;
  title: string;
  requiresActiveSeason?: boolean;
  requiresSelectedWeek?: boolean;
}

export interface NavigationOptions {
  replace?: boolean;
  state?: any;
  skipValidation?: boolean;
}

export interface RouteParams {
  seasonId?: string | undefined;
  weekId?: string | undefined;
  playerId?: string | undefined;
  [key: string]: string | undefined;
}

/**
 * Application router for managing navigation and URL state
 */
export class ApplicationRouter {
  private static instance: ApplicationRouter;
  private routes: Map<string, Route> = new Map();
  private currentRoute: Route | null = null;
  private isNavigating = false;

  private constructor() {
    this.setupRoutes();
    this.setupEventListeners();
    this.handleInitialRoute();
  }

  static getInstance(): ApplicationRouter {
    if (!ApplicationRouter.instance) {
      ApplicationRouter.instance = new ApplicationRouter();
    }
    return ApplicationRouter.instance;
  }

  /**
   * Set up application routes
   */
  private setupRoutes(): void {
    const routes: Route[] = [
      {
        path: '/',
        view: 'seasons',
        title: 'Seasons - Indoor Golf Scheduler'
      },
      {
        path: '/seasons',
        view: 'seasons',
        title: 'Seasons - Indoor Golf Scheduler'
      },
      {
        path: '/players',
        view: 'players',
        title: 'Players - Indoor Golf Scheduler',
        requiresActiveSeason: true
      },
      {
        path: '/availability',
        view: 'availability',
        title: 'Availability - Indoor Golf Scheduler',
        requiresActiveSeason: true
      },
      {
        path: '/schedule',
        view: 'schedule',
        title: 'Schedule - Indoor Golf Scheduler',
        requiresActiveSeason: true
      },
      {
        path: '/edit-schedule',
        view: 'edit-schedule',
        title: 'Edit Schedule - Indoor Golf Scheduler',
        requiresActiveSeason: true,
        requiresSelectedWeek: true
      },
      {
        path: '/export',
        view: 'export',
        title: 'Export - Indoor Golf Scheduler',
        requiresActiveSeason: true
      }
    ];

    routes.forEach(route => {
      this.routes.set(route.path, route);
    });
  }

  /**
   * Set up event listeners for navigation
   */
  private setupEventListeners(): void {
    // Handle browser back/forward buttons
    window.addEventListener('popstate', (event) => {
      this.handlePopState(event);
    });

    // Handle application state changes
    applicationState.subscribe('currentView', (newView) => {
      if (!this.isNavigating) {
        this.updateUrlForView(newView);
      }
    });

    // Handle clicks on navigation links
    document.addEventListener('click', (event) => {
      this.handleLinkClick(event);
    });
  }

  /**
   * Handle initial route when the application loads
   */
  private handleInitialRoute(): void {
    const currentPath = window.location.pathname;
    const route = this.findRouteByPath(currentPath);

    if (route) {
      this.navigateToRoute(route, { replace: true, skipValidation: true });
    } else {
      // Default to seasons view
      this.navigate('/seasons', { replace: true });
    }
  }

  /**
   * Navigate to a specific path
   */
  navigate(path: string, options: NavigationOptions = {}): void {
    const route = this.findRouteByPath(path);

    if (!route) {
      errorHandler.handleError(`Route not found: ${path}`, {
        component: 'ApplicationRouter',
        action: 'navigate'
      });
      return;
    }

    this.navigateToRoute(route, options);
  }

  /**
   * Navigate to a specific view
   */
  navigateToView(view: ApplicationView, options: NavigationOptions = {}): void {
    const route = this.findRouteByView(view);

    if (!route) {
      errorHandler.handleError(`Route not found for view: ${view}`, {
        component: 'ApplicationRouter',
        action: 'navigateToView'
      });
      return;
    }

    this.navigateToRoute(route, options);
  }

  /**
   * Navigate to a route with validation
   */
  private navigateToRoute(route: Route, options: NavigationOptions = {}): void {
    // Validate route requirements
    if (!options.skipValidation && !this.validateRouteRequirements(route)) {
      return;
    }

    this.isNavigating = true;

    try {
      // Update browser history
      const url = this.buildUrl(route.path, this.getRouteParams());
      
      if (options.replace) {
        window.history.replaceState(options.state, route.title, url);
      } else {
        window.history.pushState(options.state, route.title, url);
      }

      // Update document title
      document.title = route.title;

      // Update application state
      applicationState.navigateTo(route.view);

      // Update current route
      this.currentRoute = route;

      console.log(`Navigated to: ${route.path} (${route.view})`);

    } catch (error) {
      errorHandler.handleError(error, {
        component: 'ApplicationRouter',
        action: 'navigateToRoute',
        additionalData: { route: route.path }
      });
    } finally {
      this.isNavigating = false;
    }
  }

  /**
   * Validate route requirements
   */
  private validateRouteRequirements(route: Route): boolean {
    const state = applicationState.getState();

    // Check if active season is required
    if (route.requiresActiveSeason && !state.activeSeason) {
      errorHandler.handleWarning('Please select an active season first.');
      this.navigate('/seasons');
      return false;
    }

    // Check if selected week is required
    if (route.requiresSelectedWeek && !state.selectedWeek) {
      errorHandler.handleWarning('Please select a week first.');
      this.navigate('/schedule');
      return false;
    }

    return true;
  }

  /**
   * Handle browser back/forward navigation
   */
  private handlePopState(_event: PopStateEvent): void {
    const currentPath = window.location.pathname;
    const route = this.findRouteByPath(currentPath);

    if (route) {
      this.navigateToRoute(route, { replace: true, skipValidation: true });
    }
  }

  /**
   * Handle clicks on navigation links
   */
  private handleLinkClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const link = target.closest('a[data-route]') as HTMLAnchorElement;

    if (link && link.dataset.route) {
      event.preventDefault();
      this.navigate(link.dataset.route);
    }
  }

  /**
   * Update URL for current view without navigation
   */
  private updateUrlForView(view: ApplicationView): void {
    const route = this.findRouteByView(view);
    
    if (route && route !== this.currentRoute) {
      const url = this.buildUrl(route.path, this.getRouteParams());
      window.history.replaceState(null, route.title, url);
      document.title = route.title;
      this.currentRoute = route;
    }
  }

  /**
   * Find route by path
   */
  private findRouteByPath(path: string): Route | null {
    // Remove query parameters and hash
    const cleanPath = path.split('?')[0].split('#')[0];
    return this.routes.get(cleanPath) || null;
  }

  /**
   * Find route by view
   */
  private findRouteByView(view: ApplicationView): Route | null {
    for (const route of this.routes.values()) {
      if (route.view === view) {
        return route;
      }
    }
    return null;
  }

  /**
   * Get current route parameters from application state
   */
  private getRouteParams(): RouteParams {
    const state = applicationState.getState();
    
    return {
      seasonId: state.activeSeason?.id || undefined,
      weekId: state.selectedWeek?.id || undefined
    };
  }

  /**
   * Build URL with parameters
   */
  private buildUrl(path: string, params: RouteParams): string {
    const url = new URL(path, window.location.origin);

    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });

    return url.pathname + url.search;
  }

  /**
   * Get current route
   */
  getCurrentRoute(): Route | null {
    return this.currentRoute;
  }

  /**
   * Get all available routes
   */
  getRoutes(): Route[] {
    return Array.from(this.routes.values());
  }

  /**
   * Check if navigation is possible to a view
   */
  canNavigateTo(view: ApplicationView): boolean {
    const route = this.findRouteByView(view);
    return route ? this.validateRouteRequirements(route) : false;
  }

  /**
   * Go back in history
   */
  goBack(): void {
    window.history.back();
  }

  /**
   * Go forward in history
   */
  goForward(): void {
    window.history.forward();
  }

  /**
   * Refresh current route
   */
  refresh(): void {
    if (this.currentRoute) {
      this.navigateToRoute(this.currentRoute, { replace: true });
    }
  }
}

/**
 * Global router instance
 */
export const applicationRouter = ApplicationRouter.getInstance();

/**
 * Navigation helper functions
 */
export const navigateTo = (path: string, options?: NavigationOptions) => {
  applicationRouter.navigate(path, options);
};

export const navigateToView = (view: ApplicationView, options?: NavigationOptions) => {
  applicationRouter.navigateToView(view, options);
};

export const canNavigateTo = (view: ApplicationView): boolean => {
  return applicationRouter.canNavigateTo(view);
};

export const getCurrentRoute = (): Route | null => {
  return applicationRouter.getCurrentRoute();
};