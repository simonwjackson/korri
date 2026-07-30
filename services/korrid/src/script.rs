//! Running TypeScript and JavaScript plugins at runtime.
//!
//! A plugin is source text that evaluates to a **declaration**: what content
//! exists, what it needs, how it could be fulfilled. korrid evaluates the
//! plugin and then performs any effects itself. The plugin never touches a
//! filesystem, a network, or a process — the sandbox below exposes nothing, so
//! that rule is enforced by construction rather than by trust.
//!
//! This is what lets a plugin be federation-portable: source travels between
//! devices and runs identically on each, where a compiled artifact could not.
//!
//! Nothing is compiled ahead of time. TypeScript arrives as text and is
//! transpiled in-process at load, so adding or editing a plugin never requires
//! rebuilding korrid or the app that embeds it.

use std::path::Path;

use oxc::allocator::Allocator;
use oxc::codegen::Codegen;
use oxc::parser::Parser;
use oxc::semantic::SemanticBuilder;
use oxc::span::SourceType;
use oxc::transformer::{TransformOptions, Transformer};
use rquickjs::{Context, Runtime};

/// Transpile TypeScript to JavaScript, in-process, at load time.
pub fn transpile_ts(source: &str) -> Result<String, String> {
    let allocator = Allocator::default();
    let source_type = SourceType::ts();

    let parsed = Parser::new(&allocator, source, source_type).parse();
    if let Some(first) = parsed.diagnostics.first() {
        return Err(format!("plugin failed to parse: {first}"));
    }

    let mut program = parsed.program;
    // `with_enum_eval` is required for TS `enum` lowering; without it the
    // transformer panics instead of returning an error.
    let scoping = SemanticBuilder::new()
        .with_enum_eval(true)
        .build(&program)
        .semantic
        .into_scoping();

    let options = TransformOptions::default();
    let transformed = Transformer::new(&allocator, Path::new("plugin.ts"), &options)
        .build_with_scoping(scoping, &mut program);
    if let Some(first) = transformed.diagnostics.first() {
        return Err(format!("plugin failed to transpile: {first}"));
    }

    Ok(Codegen::new().build(&program).code)
}

/// Evaluate plugin JavaScript and return its declaration as JSON text.
///
/// The sandbox is empty: no module loader, no host bindings, no I/O. A plugin
/// that tries to reach the outside world finds nothing there.
pub fn eval_plugin(source: &str) -> Result<String, String> {
    let runtime = Runtime::new().map_err(|error| error.to_string())?;
    let context = Context::full(&runtime).map_err(|error| error.to_string())?;

    context.with(|ctx| {
        let value: rquickjs::Value = ctx
            .eval(source)
            .map_err(|error| format!("plugin evaluation failed: {error}"))?;

        let json = ctx
            .json_stringify(value)
            .map_err(|error| format!("plugin result not serialisable: {error}"))?
            .ok_or_else(|| "plugin returned undefined".to_string())?;

        json.to_string()
            .map_err(|error| format!("plugin result not readable: {error}"))
    })
}

/// Load a TypeScript plugin end to end: transpile, then evaluate.
pub fn eval_plugin_ts(source: &str) -> Result<String, String> {
    let javascript = transpile_ts(source)?;
    eval_plugin(&javascript)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TS_PLUGIN: &str = r#"
        interface Game {
          id: string
          title: string
          system: System
        }

        enum System {
          Gba = "gba",
        }

        function declare(): { kind: string; games: Game[] } {
          const games: Game[] = [
            { id: "wl4", title: "Wario Land 4", system: System.Gba },
          ]
          return { kind: "catalog", games }
        }

        declare()
    "#;

    #[test]
    fn typescript_plugin_runs_and_returns_its_declaration() {
        let json = eval_plugin_ts(TS_PLUGIN).expect("TS plugin should run");

        assert!(json.contains("\"kind\":\"catalog\""), "got: {json}");
        assert!(json.contains("Wario Land 4"), "got: {json}");
        assert!(json.contains("\"system\":\"gba\""), "got: {json}");
    }

    #[test]
    fn transpile_erases_types_and_lowers_typescript_only_syntax() {
        let javascript = transpile_ts(TS_PLUGIN).expect("should transpile");

        assert!(!javascript.contains("interface"), "got: {javascript}");
        assert!(!javascript.contains(": string"), "got: {javascript}");
    }

    #[test]
    fn the_shipped_example_plugin_still_runs() {
        // Guards the example against silent rot: it is documentation that has
        // to keep working.
        let source = include_str!("../examples/catalog.plugin.ts");
        let json = eval_plugin_ts(source).expect("example plugin should run");

        assert!(json.contains("\"kind\":\"catalog\""), "got: {json}");
        assert!(json.contains("\"routes\""), "got: {json}");
    }

    #[test]
    fn plugin_computes_rather_than_merely_parses() {
        let json = eval_plugin_ts(
            r#"
            const items: number[] = [1, 2, 3]
            ;({ total: items.reduce((sum, n) => sum + n, 0) })
        "#,
        )
        .expect("should run");

        assert_eq!(json, "{\"total\":6}");
    }

    #[test]
    fn plugin_syntax_error_is_reported_not_panicked() {
        let error = eval_plugin("this is not javascript {{{").expect_err("should fail");
        assert!(error.contains("plugin evaluation failed"), "got: {error}");
    }

    #[test]
    fn typescript_syntax_error_is_reported_at_transpile_time() {
        let error = eval_plugin_ts("const x: = 3").expect_err("should fail");
        assert!(error.contains("failed to parse"), "got: {error}");
    }

    #[test]
    fn plugin_returning_nothing_is_an_error_not_a_silent_empty() {
        let error = eval_plugin_ts("const unused = 1").expect_err("should fail");
        assert!(error.contains("undefined"), "got: {error}");
    }

    #[test]
    fn sandbox_exposes_no_host_capabilities() {
        // The declaration-only rule is enforced by the empty sandbox, not by
        // trust: a plugin has no way to reach the filesystem, network, or
        // process even if it tries.
        for probe in [
            "typeof require",
            "typeof process",
            "typeof fetch",
            "typeof globalThis.XMLHttpRequest",
        ] {
            let json = eval_plugin(probe).expect("probe should evaluate");
            assert_eq!(json, "\"undefined\"", "probe {probe} leaked a capability");
        }
    }
}
