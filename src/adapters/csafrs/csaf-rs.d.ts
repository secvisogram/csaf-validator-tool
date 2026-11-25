// The package ships TypeScript source that does not compile under this repository's strict settings.
// tsconfig.json maps the package name to this file, so only the subset the adapter uses is declared.

export type ValidationError = {
  message: string
  instancePath: string
}

export type TestResultStatus =
  | { tag: 'Success' }
  | {
      tag: 'Failure'
      errors: ValidationError[]
      warnings: ValidationError[]
      infos: ValidationError[]
    }
  | { tag: 'NotFound' }
  | { tag: 'Skipped' }

export type TestResult = {
  testId: string
  status: TestResultStatus
}

export type ValidationResult = {
  success: boolean
  version: string
  testResults: TestResult[]
}

export type TestInPreset = {
  name: string
  preset: string
}

export declare namespace CsafFfi {
  function getTests(version: string): TestInPreset[]
  function validateCsaf20(jsonStr: string, preset: string): ValidationResult
  function validateCsaf21(jsonStr: string, preset: string): ValidationResult
}
