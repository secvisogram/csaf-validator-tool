import { fireEvent, screen } from '@testing-library/react'

/** Test helpers: the steps are reached through the rail, as a user does. */
export const goToStep = (title: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${title}`) }))
export const goToTests = () => goToStep('Tests')
export const goToRun = () => goToStep('Run & report')
export const runButton = () => {
  goToRun()
  return screen.getByRole('button', { name: 'Run selected tests' })
}
