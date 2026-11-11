# Horti-code-ture

**Bower's documentation-only specification for computational horticulture.**  
**Version:** 0.1 — 11 November 2026  
**Baseline climate:** temperate United Kingdom; site-specific adaptation required everywhere else.  
**Current implementation point of departure:** the existing *Wisteria sinensis* generative growth algorithm.

## What this is

A botanical and architectural handoff scaffold: species profiles, planting logic, simulation data concepts, biological/mechanical constraints, human gardener interventions and a staged development programme. This is **not** executable software, a verified biological prediction model, or a planting specification ready for construction.

## Reading order

1. [KEY.md](KEY.md) — species relationships, planting palette, global architecture versus local plant supports.
2. [SIMULATION_KEY.md](SIMULATION_KEY.md) — scientific modelling objectives, domain entities, dynamics, equations, outputs and assumptions.
3. [CONSTRAINTS_AND_PHENOLOGY.md](CONSTRAINTS_AND_PHENOLOGY.md) — attachment mechanics, buds, flowering, dormancy, seasonal development and physical limits.
4. [HORTICULTURAL_INTERVENTIONS.md](HORTICULTURAL_INTERVENTIONS.md) — gardener events, pruning, training, replanting and monitoring.
5. [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) — agent roles, milestones and acceptance checks.
6. [SOURCES_AND_ASSUMPTIONS.md](SOURCES_AND_ASSUMPTIONS.md) — literature and the evidence-confidence policy.
7. Each **species-name folder** contains `SPECIES_PROFILE.md`.

## Scope and status

- **17 named taxa/cultivars**, including *Wisteria sinensis* and *W. floribunda* 'Macrobotrys'. Several are alternatives rather than plants to combine in one Bower.
- One non-climber (*Sarcococca confusa*) is included intentionally as an adjacent winter-scent shrub.
- A single evergreen-plus-deciduous planting composition is a **design framework**, not an instruction to install all species.
- Mechanistic differences are fundamental: twining stems, twining petioles, tendrils, aerial roots, scrambling canes, and non-climbing shrubs.
- **No plant growth rates, support-diameter tolerances, frost responses, wind loads or flowering probabilities are invented.** Such parameters are placeholders until measured or reliably sourced.
- A gardener is an active agent in the simulation; plants are not assumed to grow successfully without intervention.

## Working rules for agents

- Never equate published mature height with annual shoot growth or the reachable route across a curved Bower.
- Keep the manufactured Bower graph separate from the living plant graph. *Wood age* in flowering biology refers to the plant's own shoots, **not** manufactured Bower timber.
- Preserve lineage: removing a living stem also removes its attached leaves, buds, flowers and support contacts.
- Differentiate `evidence`, `model assumption`, `design target`, `unresolved question` and `site-dependent decision`.
- Do not hard-code flowering months as proof of blooming; represent environmental and plant-history gating as the model matures.
- Do not represent the mathematical outputs as validated structural loads.
- All geographic deployments need ecology/horticulture review, including checks for invasive species, biosecurity and public safety.
