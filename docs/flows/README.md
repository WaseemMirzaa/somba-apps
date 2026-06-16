# Somba & Tekka — System Flows & Process Guide

Client-facing documentation that explains the complete flow of the platform across all
portals, with annotated flowcharts and plain-language descriptions.

## Deliverable

**[`Somba-Tekka-System-Flows.pdf`](./Somba-Tekka-System-Flows.pdf)** — a 19-page guide covering:

1. **Platform Overview** — the six portals, dual-market model, key business rules, architecture
2. **End-to-End Order Lifecycle** — how one order moves across every portal (the big picture)
3. **Ordering Flow** — the customer purchase funnel (browse → 4-step checkout → confirmed)
4. **Delivery & Fulfilment Flow** — warehouse intake/dispatch + rider last mile + COD reconciliation
5. **Customer Portal** — account, discover, buy, after-purchase, account hub
6. **Seller Portal** — onboarding, 7-step product wizard, fulfilment, finance & payouts
7. **Rider Portal** — task lifecycle, proof of delivery, cash remittance, earnings
8. **Super Admin Portal** — RBAC governance: approvals, money, catalog/marketing, platform, oversight
- **Appendix** — status reference tables (order, parcel/delivery, return, dispute, fraud)

Each section pairs a colour-coded flowchart with a step-by-step narrative.

## Regenerating

The PDF and all flowcharts are generated from code, so they can be re-rendered any time.

```bash
cd docs/flows
python3 diagrams.py     # renders the 8 flowcharts to diagrams/*.png (uses Graphviz `dot`)
python3 build_pdf.py    # assembles the PDF (uses reportlab)
```

Requirements: `graphviz` (the `dot` binary), Python with `reportlab` and `Pillow`.

- `diagrams.py` — Graphviz definitions for every flowchart (edit here to change a diagram)
- `build_pdf.py` — document assembly: cover, contents, narratives, figures, tables
- `diagrams/` — generated `.dot` sources and `.png` renders

> The flows describe the platform's intended production behaviour. The current build runs on
> mock data (no live backend, payment capture or push notifications).
