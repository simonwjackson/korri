//! Evaluate one declaration-only plugin and explain its local announcement.
//!
//! This intentionally stops at the registry boundary: it does not load
//! persisted configuration, resolve content, perform a launch, or publish to
//! federation peers.

use std::{env, fs, process};

use korrid::plugin::{load_plugin_source, Plugin, PluginRegistry};
use korrid::plugin_policy::{resolve_enabled_plugin_ids, PluginPolicyLayer};

enum ReportMode {
    Enabled,
    Disabled,
    Review,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("PLUGIN REGISTRY FAILED: {error}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let path = args.next().ok_or_else(|| {
        "usage: plugin_registry_probe <plugin.ts> [--disabled|--review]".to_owned()
    })?;
    let mode = match args.next().as_deref() {
        None => ReportMode::Enabled,
        Some("--disabled") => ReportMode::Disabled,
        Some("--review") => ReportMode::Review,
        Some(other) => return Err(format!("unknown argument {other}")),
    };
    if args.next().is_some() {
        return Err("too many arguments".to_owned());
    }

    let source =
        fs::read_to_string(&path).map_err(|error| format!("cannot read {path}: {error}"))?;
    let plugin = load_plugin_source(&source).map_err(|error| error.to_string())?;

    match mode {
        ReportMode::Enabled => print_report(plugin, true),
        ReportMode::Disabled => print_report(plugin, false),
        ReportMode::Review => {
            println!("== enabled plugin ==");
            print_report(plugin.clone(), true)?;
            println!();
            println!("== disabled plugin ==");
            print_report(plugin, false)
        }
    }
}

fn print_report(plugin: Plugin, enabled: bool) -> Result<(), String> {
    let plugin_id = plugin.id().to_owned();
    let enabled_ids = resolve_enabled_plugin_ids([PluginPolicyLayer::from_enabled([(
        plugin_id.as_str(),
        enabled,
    )])]);
    let registry =
        PluginRegistry::new(vec![plugin], enabled_ids).map_err(|error| error.to_string())?;

    println!("plugin: {plugin_id}");
    println!(
        "registered: {}",
        yes_no(
            registry
                .registered_plugin_ids()
                .contains(&plugin_id.as_str())
        )
    );
    println!(
        "enabled: {}",
        yes_no(registry.enabled_plugin_ids().contains(&plugin_id.as_str()))
    );
    print_records(
        "registered-session-control",
        registry
            .registered_session_controls()
            .values()
            .map(|record| record.id.as_str()),
    );
    print_records(
        "provider",
        registry
            .providers()
            .values()
            .map(|record| record.id.as_str()),
    );
    print_records(
        "system",
        registry.systems().values().map(|record| record.id.as_str()),
    );
    print_records(
        "launcher",
        registry
            .launchers()
            .values()
            .map(|record| record.id.as_str()),
    );
    print_records(
        "transport",
        registry
            .transports()
            .values()
            .map(|record| record.id.as_str()),
    );
    print_records(
        "runtime",
        registry
            .runtimes()
            .values()
            .map(|record| record.id.as_str()),
    );
    print_records(
        "session-control",
        registry
            .session_controls()
            .values()
            .map(|record| record.id.as_str()),
    );

    Ok(())
}

fn yes_no(value: bool) -> &'static str {
    if value {
        "yes"
    } else {
        "no"
    }
}

fn print_records<'a>(label: &str, records: impl Iterator<Item = &'a str>) {
    let records: Vec<&str> = records.collect();
    if records.is_empty() {
        println!("{label}: none");
    } else {
        for record in records {
            println!("{label}: {record}");
        }
    }
}
