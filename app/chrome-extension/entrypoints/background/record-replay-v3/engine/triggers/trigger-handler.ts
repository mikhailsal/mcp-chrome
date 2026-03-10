/**
 * @fileoverview Trigger handler interface definitions.
 * @description Defines the shared interface implemented by all trigger handler types.
 */

import type { TriggerSpec, TriggerKind } from '../../domain/triggers';

/**
 * Trigger handler interface.
 * @description Every trigger type must implement this interface.
 */
export interface TriggerHandler<K extends TriggerKind = TriggerKind> {
  /** Trigger kind. */
  readonly kind: K;

  /**
   * Install a trigger.
   * @description Registers chrome API listeners and similar resources.
   * @param trigger Trigger specification.
   */
  install(trigger: Extract<TriggerSpec, { kind: K }>): Promise<void>;

  /**
   * Uninstall a trigger.
   * @description Removes chrome API listeners and similar resources.
   * @param triggerId Trigger ID.
   */
  uninstall(triggerId: string): Promise<void>;

  /**
   * Uninstall all triggers of this type.
   * @description Cleans up all triggers owned by this handler.
   */
  uninstallAll(): Promise<void>;

  /**
   * Get the list of installed trigger IDs.
   */
  getInstalledIds(): string[];
}

/**
 * Trigger-fire callback.
 * @description Callback injected by `TriggerManager` into each handler.
 */
export interface TriggerFireCallback {
  /**
   * Called when a trigger fires.
   * @param triggerId Trigger ID.
   * @param context Trigger context.
   */
  onFire(
    triggerId: string,
    context: {
      sourceTabId?: number;
      sourceUrl?: string;
    },
  ): Promise<void>;
}

/**
 * Trigger handler factory.
 */
export type TriggerHandlerFactory<K extends TriggerKind> = (
  fireCallback: TriggerFireCallback,
) => TriggerHandler<K>;
