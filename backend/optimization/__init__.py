"""MIPROv2 self-optimization pipeline.

Registry + promotion (registry.py), per-agent metrics (metrics.py), trainsets
from the live telemetry log + curated gold sets (trainsets.py), a token-budget
guard (budget.py), and the compile → gate → promote entry point (run.py).
"""
