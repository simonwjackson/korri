export type StepKeyword = "Given" | "When" | "Then"

export type StepPattern = string | RegExp

export type StepFunction<W = unknown> = (
  this: W,
  // biome-ignore lint/suspicious/noExplicitAny: step args are inherently dynamic
  ...args: any[]
) => void | Promise<void>

export interface StepDefinition<W = unknown> {
  keyword: StepKeyword
  pattern: StepPattern
  fn: StepFunction<W>
}

export type HookFunction<W = unknown> = (
  this: W,
  // biome-ignore lint/suspicious/noExplicitAny: hook context varies by runner
  ...args: any[]
) => void | Promise<void>

const stepDefinitions: StepDefinition[] = []
const beforeHooks: HookFunction[] = []
const afterHooks: HookFunction[] = []

export function Given<W = unknown>(
  pattern: StepPattern,
  fn: StepFunction<W>,
): void {
  stepDefinitions.push({ keyword: "Given", pattern, fn: fn as StepFunction })
}

export function When<W = unknown>(
  pattern: StepPattern,
  fn: StepFunction<W>,
): void {
  stepDefinitions.push({ keyword: "When", pattern, fn: fn as StepFunction })
}

export function Then<W = unknown>(
  pattern: StepPattern,
  fn: StepFunction<W>,
): void {
  stepDefinitions.push({ keyword: "Then", pattern, fn: fn as StepFunction })
}

export function Before<W = unknown>(fn: HookFunction<W>): void {
  beforeHooks.push(fn as HookFunction)
}

export function After<W = unknown>(fn: HookFunction<W>): void {
  afterHooks.push(fn as HookFunction)
}

export function getStepDefinitions(): ReadonlyArray<StepDefinition> {
  return stepDefinitions
}

export function getBeforeHooks(): ReadonlyArray<HookFunction> {
  return beforeHooks
}

export function getAfterHooks(): ReadonlyArray<HookFunction> {
  return afterHooks
}

export function clearRegistry(): void {
  stepDefinitions.length = 0
  beforeHooks.length = 0
  afterHooks.length = 0
}
