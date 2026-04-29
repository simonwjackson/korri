import { readFileSync } from "node:fs"
import {
  AstBuilder,
  compile,
  GherkinClassicTokenMatcher,
  Parser,
} from "@cucumber/gherkin"
import { IdGenerator } from "@cucumber/messages"

export type ParsedStepArgDataTable = {
  type: "dataTable"
  rows: string[][]
}

export type ParsedStepArgDocString = {
  type: "docString"
  content: string
  mediaType: string | undefined
}

export type ParsedStepArg = ParsedStepArgDataTable | ParsedStepArgDocString

export type ParsedStep = {
  text: string
  argument: ParsedStepArg | undefined
}

export type ParsedScenario = {
  name: string
  tags: string[]
  steps: ParsedStep[]
}

export type ParsedFeature = {
  name: string
  tags: string[]
  sourcePath: string
  scenarios: ParsedScenario[]
}

export function parseFeatureFile(filePath: string): ParsedFeature {
  const source = readFileSync(filePath, "utf-8")
  return parseFeatureSource(source, filePath)
}

export function parseFeatureSource(
  source: string,
  sourcePath: string,
): ParsedFeature {
  const newId = IdGenerator.uuid()
  const parser = new Parser(
    new AstBuilder(newId),
    new GherkinClassicTokenMatcher(),
  )
  const gherkinDocument = parser.parse(source)

  if (!gherkinDocument.feature) {
    return {
      name: "",
      tags: [],
      sourcePath,
      scenarios: [],
    }
  }

  const feature = gherkinDocument.feature
  const featureTags = feature.tags.map(tag => tag.name)
  const pickles = compile(gherkinDocument, sourcePath, newId)

  const scenarios: ParsedScenario[] = pickles.map(pickle => ({
    name: pickle.name,
    tags: pickle.tags.map(tag => tag.name),
    steps: pickle.steps.map(step => {
      let argument: ParsedStepArg | undefined

      if (step.argument?.dataTable) {
        argument = {
          type: "dataTable",
          rows: step.argument.dataTable.rows.map(row =>
            row.cells.map(cell => cell.value),
          ),
        }
      } else if (step.argument?.docString) {
        argument = {
          type: "docString",
          content: step.argument.docString.content,
          mediaType: step.argument.docString.mediaType || undefined,
        }
      }

      return {
        text: step.text,
        argument,
      }
    }),
  }))

  return {
    name: feature.name,
    tags: featureTags,
    sourcePath,
    scenarios,
  }
}
