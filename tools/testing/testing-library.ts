/**
 * Testing Library setup for Bun tests
 * This file extends Bun's expect with custom Testing Library-style matchers and sets up automatic cleanup.
 *
 * TypeScript support for these matchers lives in
 * `tools/testing/bun-testing-library-matchers.d.ts`.
 */

import { afterEach, expect } from "bun:test"
import { cleanup } from "@testing-library/react"

// Import specific matchers that are compatible with Bun
// This avoids the ExpectMatcherUtils compatibility issue
const matchers = {
  toBeInTheDocument: (
    expected: unknown,
  ): { pass: boolean; message: () => string } => {
    const element = expected as Element | null
    const pass = Boolean(element?.ownerDocument.contains(element))
    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to be in the document`
          : `Expected element to be in the document`,
    }
  },

  toHaveAttribute: (
    expected: unknown,
    attribute: string,
    value?: string,
  ): { pass: boolean; message: () => string } => {
    const element = expected as Element
    const hasAttribute = element.hasAttribute(attribute)
    const attributeValue = element.getAttribute(attribute)
    const pass =
      value === undefined
        ? hasAttribute
        : hasAttribute && attributeValue === value

    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to have attribute ${attribute}${value !== undefined ? ` with value ${value}` : ""}`
          : `Expected element to have attribute ${attribute}${value !== undefined ? ` with value ${value}` : ""}`,
    }
  },

  toHaveClass: (
    expected: unknown,
    ...classNames: string[]
  ): { pass: boolean; message: () => string } => {
    const element = expected as Element
    const pass = classNames.every(className =>
      element.classList.contains(className),
    )
    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to have class(es): ${classNames.join(", ")}`
          : `Expected element to have class(es): ${classNames.join(", ")}`,
    }
  },

  toHaveValue: (
    expected: unknown,
    value?: string | number | string[] | null,
  ): { pass: boolean; message: () => string } => {
    const element = expected as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
    const actualValue = element.value
    const pass = actualValue === value
    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to have value "${value}", but it did`
          : `Expected element to have value "${value}", but got "${actualValue}"`,
    }
  },

  toBeDisabled: (
    expected: unknown,
  ): { pass: boolean; message: () => string } => {
    const element = expected as HTMLElement
    const pass =
      element.hasAttribute("disabled") ||
      (element as HTMLButtonElement).disabled === true
    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to be disabled`
          : `Expected element to be disabled`,
    }
  },

  toBeChecked: (
    expected: unknown,
  ): { pass: boolean; message: () => string } => {
    const element = expected as HTMLInputElement
    const pass =
      element.checked === true ||
      element.getAttribute("data-state") === "checked"
    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to be checked`
          : `Expected element to be checked`,
    }
  },

  toHaveTextContent: (
    expected: unknown,
    text: string | RegExp,
  ): { pass: boolean; message: () => string } => {
    const element = expected as HTMLElement
    const textContent = element.textContent || ""
    const pass =
      typeof text === "string"
        ? textContent.includes(text)
        : text.test(textContent)
    return {
      pass,
      message: () =>
        pass
          ? `Expected element not to have text content "${text}"`
          : `Expected element to have text content "${text}", but got "${textContent}"`,
    }
  },
}

// Extend Bun's expect with Testing Library matchers
expect.extend(matchers)

// Automatically cleanup after each test to prevent memory leaks and test interference
afterEach(() => {
  cleanup()
})
