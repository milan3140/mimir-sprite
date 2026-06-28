"""Stop-hook: surface the Definition-of-Done kernel at the report boundary (the "right time").

Deterministic + SAFE by construction: wrapped in a bare try/except and ALWAYS exits 0, so it can
never block, loop, or break the CLI. It only prints a short reminder (non-blocking enforcement);
the always-loaded CLAUDE.md carries the binding rule. Fires on every Stop, project-wide.
"""
import sys

try:
    print(
        "DoD check before done: (1) named the correctness criteria INCL. dynamic "
        "(no flicker / smooth / no mid-transition break / nothing displaced)? "
        "(2) verified with the MATCHED modality — geometry→probe, visual/animation→actually looked? "
        "(3) touched an existing subsystem → re-ran ALL its checks (not just the new one)? "
        "If ≥2 fixes failed on the same symptom → question the architecture, don't keep patching."
    )
except Exception:
    pass
sys.exit(0)
