//! Title and id normalization for discovered file-backed releases.

/// Derive the immediate, local title shown before metadata enrichment.
pub fn fallback_title(file_name: &str, extension: &str) -> String {
    let extension = extension.trim_start_matches('.');
    let mut stem = file_name.to_owned();
    let suffix = format!(".{extension}");
    if stem
        .to_ascii_lowercase()
        .ends_with(&suffix.to_ascii_lowercase())
    {
        let next_len = stem.len().saturating_sub(suffix.len());
        stem.truncate(next_len);
    }

    let mut without_groups = String::new();
    let mut paren_depth = 0usize;
    let mut bracket_depth = 0usize;
    for character in stem.chars() {
        match character {
            '(' if bracket_depth == 0 => paren_depth += 1,
            ')' if bracket_depth == 0 && paren_depth > 0 => paren_depth -= 1,
            '[' if paren_depth == 0 => bracket_depth += 1,
            ']' if paren_depth == 0 && bracket_depth > 0 => bracket_depth -= 1,
            _ if paren_depth == 0 && bracket_depth == 0 => without_groups.push(character),
            _ => {}
        }
    }

    let normalized = without_groups
        .chars()
        .map(|character| match character {
            '_' | '-' | '.' => ' ',
            other => other,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if normalized.is_empty() {
        stem.split_whitespace().collect::<Vec<_>>().join(" ")
    } else {
        normalized
    }
}

pub fn slug_base(title: &str) -> String {
    let mut slug = String::new();
    let mut last_was_sep = false;
    for character in title.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_lowercase() || character.is_ascii_digit() {
            slug.push(character);
            last_was_sep = false;
        } else if !slug.is_empty() && !last_was_sep {
            slug.push('-');
            last_was_sep = true;
        }
    }
    while slug.ends_with('-') || slug.ends_with('.') || slug.ends_with('_') {
        slug.pop();
    }
    if slug.is_empty() || slug == "." || slug == ".." {
        "game".into()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_dump_decorations_and_keeps_useful_title_text() {
        assert_eq!(
            fallback_title("Wario_Land_4 (USA) [!].GBA", "gba"),
            "Wario Land 4"
        );
        assert_eq!(
            fallback_title("Pokémon - Emerald (Rev 1).gba", "gba"),
            "Pokémon Emerald"
        );
    }

    #[test]
    fn creates_schema_safe_slugs_with_fallback() {
        assert_eq!(slug_base("Pokémon Emerald"), "pok-mon-emerald");
        assert_eq!(slug_base("🎮"), "game");
        assert_eq!(slug_base("007: GoldenEye"), "007-goldeneye");
    }
}
