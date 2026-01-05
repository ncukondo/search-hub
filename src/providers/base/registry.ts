/**
 * Provider registry for managing and discovering database providers.
 */

import type { Provider, ProviderName } from './types';
import type { BaseProviderConfig } from './provider';

/**
 * Factory function type for creating provider instances.
 */
export type ProviderFactory = (config?: BaseProviderConfig) => Provider;

/**
 * Registry for managing provider factories.
 *
 * Allows providers to register themselves at startup
 * and be discovered by the search orchestrator.
 */
export class ProviderRegistry {
  private factories: Map<ProviderName, ProviderFactory> = new Map();
  private registrationOrder: ProviderName[] = [];

  /**
   * Register a provider factory.
   * @param name Provider name identifier
   * @param factory Factory function to create provider instances
   */
  register(name: ProviderName, factory: ProviderFactory): void {
    // Remove from order if re-registering
    if (this.factories.has(name)) {
      this.registrationOrder = this.registrationOrder.filter((n) => n !== name);
    }

    this.factories.set(name, factory);
    this.registrationOrder.push(name);
  }

  /**
   * Get a provider instance by name.
   * @param name Provider name identifier
   * @param config Optional configuration for the provider
   * @returns New provider instance
   * @throws Error if provider is not registered
   */
  get(name: ProviderName, config?: BaseProviderConfig): Provider {
    const factory = this.factories.get(name);

    if (!factory) {
      throw new Error(`Provider '${name}' is not registered`);
    }

    return factory(config);
  }

  /**
   * List all registered provider names.
   * @returns Array of provider names in registration order
   */
  list(): ProviderName[] {
    return [...this.registrationOrder];
  }

  /**
   * Check if a provider is registered.
   * @param name Provider name identifier
   * @returns true if registered, false otherwise
   */
  has(name: ProviderName): boolean {
    return this.factories.has(name);
  }
}

/**
 * Create a new provider registry instance.
 * Use this for testing or when you need isolated registries.
 */
export function createProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}

/**
 * Global provider registry singleton.
 * Use this in production for shared provider registration.
 */
export const globalRegistry = createProviderRegistry();
