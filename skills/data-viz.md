---
id: data-viz
name: Charts and visualization
category: Data
icon: ◔
triggers: chart, graph, plot, visualization, visualize, bar chart, line chart, pie, dashboard, histogram, scatter, matplotlib, diagram of data
summary: Design honest, readable charts — pick the right form, label everything, never distort scale.
---
## When to use
- The user wants data visualized: charts, plots, dashboards, or a comparison graphic.
- Improving an existing chart that is misleading, cluttered, or unclear.

## Approach
Choose the form from the question: comparison → bars, trend over time → line, part-of-whole → stacked bar or pie (≤5 slices), relationship → scatter, distribution → histogram/box. The question picks the chart, never the other way around.

## Steps
1. Identify the one message the chart must carry; write it as the title (a claim, not a topic: "Churn doubled after March").
2. Generate it with a script (matplotlib, ECharts, SVG) so it is reproducible; save to a file in the workspace.
3. Label axes with units, sort categories by value (unless order is intrinsic), start bar axes at zero.
4. Use at most one accent color for the thing that matters; gray for context. Sonderr palette: blue on white.
5. Remove chart junk: no 3D, no double y-axes when one suffices, no gridline forests.
6. Present the finished image with present_file; embed the generating script alongside it.

## Pitfalls
- Truncated bar axes that exaggerate differences; pies with 10 slices; rainbow palettes that imply order.
- Log scales without saying so.
- A chart with no units, no source, no title claim.

## Verify
- Compare plotted values with the underlying data and confirm labels, units, and time range.
- Check that scale, sorting, color, and missing values do not change the intended interpretation.
- Open the exported image at its intended size and ensure text remains readable.
