import type {
  RuntimeConfig,
  RuntimeConfigLoad,
  SessionEdits,
  Settings,
} from './types.ts'

export const BUILT_IN_DEFAULTS: Settings = {
  services: { javascript: null, rust: null },
  validator: 'csaf-validator-lib',
  csafVersion: 'document',
  reportView: 'all-messages',
}

/** Valid runtime configuration over the built-in defaults. */
export function applyRuntimeConfig(
  base: Settings,
  config: RuntimeConfig,
): Settings {
  return {
    services: {
      javascript: config.services.javascript ?? base.services.javascript,
      rust: config.services.rust ?? base.services.rust,
    },
    validator: config.defaults.validator ?? base.validator,
    csafVersion: config.defaults.csafVersion ?? base.csafVersion,
    reportView: config.defaults.reportView ?? base.reportView,
  }
}

/** Current-session edits over everything else. */
export function applySessionEdits(
  base: Settings,
  edits: SessionEdits,
): Settings {
  const services = edits.services ?? {}
  return {
    services: {
      javascript:
        services.javascript !== undefined
          ? services.javascript
          : base.services.javascript,
      rust: services.rust !== undefined ? services.rust : base.services.rust,
    },
    validator: edits.validator ?? base.validator,
    csafVersion: edits.csafVersion ?? base.csafVersion,
    reportView: edits.reportView ?? base.reportView,
  }
}

/**
 * Precedence: built-in defaults, then valid runtime configuration, then
 * current-session edits. A configuration that did not load as a whole
 * (absent or failed) contributes nothing.
 */
export function resolveSettings(
  runtime: RuntimeConfigLoad | null,
  edits: SessionEdits,
): Settings {
  const withRuntime =
    runtime?.status === 'loaded'
      ? applyRuntimeConfig(BUILT_IN_DEFAULTS, runtime.config)
      : BUILT_IN_DEFAULTS
  return applySessionEdits(withRuntime, edits)
}

/** Merges one edit into the previous edits without touching other keys. */
export function mergeEdits(
  previous: SessionEdits,
  edit: SessionEdits,
): SessionEdits {
  return {
    ...previous,
    ...edit,
    ...((previous.services || edit.services) && {
      services: { ...previous.services, ...edit.services },
    }),
  }
}
