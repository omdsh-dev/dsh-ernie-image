/**
 * The `settings.plugin.item` slot type — one plugin's card inside the plugin
 * configuration section. Copied (type declaration only) from
 * @deepseek-ai/dsh-client-ui-plugin-config's slot-contract.ts so this package
 * can register a card without importing the section package at runtime.
 * The runtime slot itself is declared by that package's browser half.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** One plugin's card inside the plugin configuration section. */
    'settings.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}
