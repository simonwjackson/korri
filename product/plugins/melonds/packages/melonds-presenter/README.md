# korri-melonds-presenter

Plugin-owned helper for melonDS matched dual-screen presentation.

It reads a materializer-generated JSON payload, powers the secondary Sway output on, launches melonDS with argv arrays, waits for exactly one top and bottom melonDS window, floats and places them, then restores the observed secondary-output power state when melonDS exits.
