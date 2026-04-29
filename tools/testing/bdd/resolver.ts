import {
  CucumberExpression,
  ParameterTypeRegistry,
  RegularExpression,
} from "@cucumber/cucumber-expressions"
import { DataTable } from "./data-table"
import type { ParsedScenario, ParsedStep } from "./parser"
import {
  getAfterHooks,
  getBeforeHooks,
  getStepDefinitions,
  type StepDefinition,
} from "./registry"
import type { BddWorld } from "./world"

type CompiledExpression = CucumberExpression | RegularExpression

interface ResolvedStep {
  definition: StepDefinition
  args: unknown[]
}

const parameterTypeRegistry = new ParameterTypeRegistry()
const expressionCache = new WeakMap<StepDefinition, CompiledExpression>()

function getExpression(definition: StepDefinition): CompiledExpression {
  let expression = expressionCache.get(definition)
  if (!expression) {
    expression =
      definition.pattern instanceof RegExp
        ? new RegularExpression(definition.pattern, parameterTypeRegistry)
        : new CucumberExpression(definition.pattern, parameterTypeRegistry)
    expressionCache.set(definition, expression)
  }
  return expression
}

export function resolveStep(text: string): ResolvedStep {
  const definitions = getStepDefinitions()
  const matches: Array<{ definition: StepDefinition; args: unknown[] }> = []

  for (const definition of definitions) {
    const expression = getExpression(definition)
    const result = expression.match(text)
    if (result !== null) {
      matches.push({
        definition,
        args: result.map(arg => arg.getValue(undefined)),
      })
    }
  }

  if (matches.length === 0) {
    const registered = definitions
      .map(
        definition => `  ${definition.keyword} ${String(definition.pattern)}`,
      )
      .join("\n")
    throw new Error(
      `No step definition matches: "${text}"\n\nRegistered steps:\n${registered}`,
    )
  }

  if (matches.length > 1) {
    const ambiguous = matches
      .map(
        match =>
          `  ${match.definition.keyword} ${String(match.definition.pattern)}`,
      )
      .join("\n")
    throw new Error(
      `Ambiguous step: "${text}" matched ${matches.length} definitions:\n${ambiguous}`,
    )
  }

  return matches[0]
}

export async function executeStep(
  world: BddWorld,
  step: ParsedStep,
): Promise<void> {
  const { definition, args } = resolveStep(step.text)

  const callArgs = [...args]
  if (step.argument?.type === "dataTable") {
    callArgs.push(new DataTable(step.argument.rows))
  } else if (step.argument?.type === "docString") {
    callArgs.push(step.argument.content)
  }

  await definition.fn.apply(world, callArgs)
}

export async function executeScenario(
  world: BddWorld,
  scenario: ParsedScenario,
): Promise<void> {
  for (const hook of getBeforeHooks()) {
    await hook.call(world)
  }

  try {
    for (const step of scenario.steps) {
      await executeStep(world, step)
    }
  } finally {
    for (const hook of getAfterHooks()) {
      await hook.call(world)
    }
  }
}
