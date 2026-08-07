# Prior art: same-size and same-gap snapping

Research for [#144](https://github.com/fauxparse/mechane/issues/144), split out of [#142](https://github.com/fauxparse/mechane/issues/142), under map [#130](https://github.com/fauxparse/mechane/issues/130).
Date: 2026-08-08. All claims cited to primary sources (vendor documentation, vendor-run forums with staff replies, and open source read directly).

## The question

#142 settled grid snapping and edge/centreline smart guides but left **same-size** and **same-gap** snapping out of v1. This is the class of behaviour where the editor infers an intent — "you are spacing these evenly", "you are matching that width" — rather than aligning to a thing that already exists. Inference is the whole difficulty: an edge is either there or it isn't, but *equal spacing* is a pattern the editor decides is present, and it can decide wrongly.

Six axes are tracked throughout: **(a)** what triggers detection and in what units; **(b)** how many participants are required; **(c)** during the drag or after it, suggestion or snap; **(d)** how it is drawn and how noise is bounded; **(e)** whether size and spacing are one feature or two; **(f)** where it deliberately does not fire.

---

## 1. Headline findings

**Same-gap and same-size are two features, and almost nobody builds the second one.** Figma, tldraw, PenPot and Inkscape all do equal-*spacing* inference and have **no same-size snapping at all** — matching a width falls out of ordinary edge snapping. Only Sketch and Affinity Designer treat same-size as a real behaviour, and Affinity fuses the two into a single toggle (`Snap to gaps and sizes`). Mechanē's #142 edge/centreline guides already deliver the emergent version for free.

**Figma's equal-spacing badges — the thing this ticket is named after — are undocumented.** The official snap-to settings are three, and equal spacing is not among them. What *is* documented is Smart Selection, a **post-hoc** feature that recognises spacing that is already equal and then maintains it. Figma's documented behaviour is "discover an invariant, then hold it", not "guess what you meant".

**One pre-existing gap is enough, in every live implementation.** tldraw's `gap_duplicate`, PenPot, Sketch and Inkscape all propose an equal gap from a single prior gap. The "three or more" number people quote comes from Figma's blog and applies to the post-hoc feature. Requiring three would be the quietest live design available, and nobody has shipped it.

**Everyone who ships this measures in screen pixels divided by zoom** — tldraw 8 px, PenPot 10/20/40 px, Inkscape's five separate tolerances, Affinity's "Screen tolerance". #142 settled canvas units for Mechanē. That is a real, deliberate disagreement with the entire field (§11.1).

**The best idea found is asymmetric tolerance.** Inkscape is generous about the gap *you* are forming and near-exact about whether the *other* objects already form a pattern. tldraw is exact about the latter too. PenPot is loose about both, and PenPot's tracker is where the "it snapped to something off screen" complaints live.

**Nobody complains that detection is dumb; they complain about candidate sets and escape hatches.** Serif documents its own performance blow-up from unbounded candidates. Inkscape has an open multi-minute-freeze bug. PenPot's top snapping request is a hold-to-disable modifier it still does not have. Figma's is guides firing against locked objects.

---

## 2. Figma

Figma is the reference implementation in everyone's head, and the striking thing on inspection is **how little of it is documented**. The equal-spacing badges that people associate with Figma appear in no help article; the official snapping page describes only edge and centre alignment.

### Snap-to during a drag

> "When resizing an object, moving layers, or moving vector points, use the **snap to** settings to help align them to other elements on the canvas. A red guide appears on the canvas as a visual indicator."

The settings are exactly three, and **equal spacing is not among them**:

- **Snap to geometry** — vector edit mode only; aligns vector points to other vector points
- **Snap to objects** — "Align the centers and outermost points of different objects"
- **Snap to pixel grid** — prevents export misalignment

— <https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions>

Three things follow. First, **same-size snapping is not a feature in Figma** — matching a width happens only as a side effect of `Snap to objects` catching the far edge while you resize, which requires the two objects to be *positioned* compatibly. Figma users ask for a real one and are answered with plugins ([Match Size](https://www.figma.com/community/plugin/1271528521145185506/match-size), [Size Snap](https://www.figma.com/community/plugin/1513572514413172716/size-snap)) and with auto layout's `Fill container` (<https://forum.figma.com/t/auto-layout-with-each-item-same-size/5276>).

Second, snapping is **globally toggleable, not per-file**: "Snap to settings are applied across your Figma Design files" (<https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-dimensions-rotation-and-position>), plus a held-modifier escape hatch — "hold Ctrl to temporarily disable all snapping" (<https://forum.figma.com/archive-21/launched-hold-ctrl-to-temporarily-disable-all-snapping-24942>).

Third, pixel quantization is explicitly allowed to *lose* against tidiness: with the pixel grid on, "you may see subtle discrepancies in spacing between layers. Figma will allow up to 1px of rounding."

### Smart selection — the equal-spacing feature proper

Figma's actual equal-spacing machinery is a **post-selection** feature, not a drag-time one. Its trigger condition is stated twice, inconsistently:

> "To make a Smart selection, all layers must be an equal distance apart and overlap on either the x or y axis (1D), or both (2D)."
> — <https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection>

> "It works automatically on any selection or group of **three or more items** with equal, uniform spacing."
> — Rasmus Andersson, <https://www.figma.com/blog/introducing-smart-selection/>

The help centre says two or more; the engineering blog says three or more. **Three is the defensible number** — with two objects there is one gap, and one gap is not a pattern.

Note the second condition, which is the anti-noise rule and the more interesting one: participants must **overlap on the perpendicular axis**. Two objects at opposite corners of a frame have a horizontal gap in the arithmetic sense but are not a row, and Figma refuses to treat them as one.

Presentation, once inferred: "Figma adds smart handles to your selection on the canvas. Each distinct object has a pink ring in the center of it," and on hover "additional pink handles will appear between each layer" with tooltips showing the pixel distance. Resizing a member "lets you resize layers within the selection, while maintaining an equal distance between layers" — Figma repositions the others. So equal spacing, once *recognised*, becomes a **maintained invariant** rather than a one-shot snap.

Where it does not fire: if layers are not equally spaced, there is no smart selection at all — the documented remedy is to run **Tidy up** first, i.e. make it true, then it is recognised. Equal spacing is discovered, never suggested.

### Distribute and Tidy up — the post-hoc route

- **Distribute** equalises spacing while holding the outermost objects still, and "doesn't require layers to overlap on either axis."
- **Tidy up** arranges as rows/columns/grids and "will perform both, if required" (align *and* distribute).
- For both, the resulting spacing shown is "based on the most common space between value (**the mode**)" — a nice trick: Figma infers the intended gap statistically rather than averaging, so one outlier does not drag the answer.

### Measurement is a separate, deliberate, manual mode

> "Select the first object in the canvas. Hold down the modifier key" then "Hover over the second object." Figma "will display a red line between the two objects, as well as horizontal and vertical measurements."
> — <https://help.figma.com/hc/en-us/articles/360039956974-Measure-distances-between-layers>

Numbers are **opt-in and hover-driven**, not shown during a drag. And: "It's not currently possible to change the weight or color of the red measurement line."

### What users complain about

The complaints are not about equal spacing being wrong — they are about snapping being *magnetic* in dense layouts:

- "It would be so nice to be able to turn off red guides in a menu setting temporarily, since some of my workflows involve quickly placing and arranging images into a frame without need for the **jittery and often confusing alignments auto-enforced** by this setting." A Figma staff member's answer was the global preference toggle. (<https://forum.figma.com/report-a-problem-6/ctrl-hotkey-not-working-to-disable-smart-guides-and-all-snapping-56373>)
- "No matter how smart a snapping algorithm is, there will be times when it gets it wrong and snaps to the wrong thing, especially in a complex layout, and a quick way to bypass this would decrease the annoyance factor." (<https://forum.figma.com/t/disable-snap-to-smart-guides/13000>)
- Guides still fire against **locked** objects (<https://forum.figma.com/archive-21/drag-and-dropping-a-locked-item-still-shows-the-alignment-guides-15276>).

The transferable lesson: candidate-set control and a cheap escape hatch matter more than detection cleverness.

---

## 3. tldraw — the readable implementation

tldraw is MIT-licensed and its snapping is the most legible full implementation of gap snapping in the open. It is worth reading closely because it makes every choice Figma leaves undocumented, explicitly.

### Three distinct gap snaps

> "Gap snapping maintains consistent spacing between shapes."
> - "**Gap center snapping** centers the selection within a gap larger than itself, with equal spacing on both sides."
> - "**Gap duplication** snapping duplicates an existing gap on the opposite side of a shape. For example, if two shapes have a 100px gap between them, dragging a third shape snaps to create another 100px gap."
> - "**Adjacent gap detection** finds all gaps with matching lengths and displays them together, so spacing stays consistent across many shapes."
>
> — <https://github.com/tldraw/tldraw/blob/main/apps/docs/content/sdk-features/snapping.mdx>

`gap_duplicate` is the one Figma has and does not document: **one existing gap is enough** to propose a second. In the code the snap union is exactly `{ type: 'points' } | { type: 'gap_center' } | { type: 'gap_duplicate' }` (`BoundsSnaps.ts` L53–70).

### Threshold: screen pixels, zoom-compensated

```ts
@computed getSnapThreshold() {
    return this.editor.options.snapThreshold / this.editor.getZoomLevel()
}
```
— `packages/editor/src/lib/editor/managers/SnapManager/SnapManager.ts`

with, in `packages/editor/src/lib/options.ts`:

```ts
/**
 * The distance (in screen pixels) at which shapes snap to guides and other shapes.
 */
readonly snapThreshold: number
...
snapThreshold: 8,
```

**8 screen pixels, divided by zoom** — i.e. the threshold is constant *on screen* and shrinks in canvas units as you zoom in. This is the direct opposite of the choice #142 settled for Mechanē (canvas units, on the reasoning that snapping is about tidiness, not pointer imprecision). See §7.

### Equality is exact, not tolerant

Gap *lengths* are matched with no tolerance beyond float-noise cleanup:

```ts
const round = (x: number) => {
    // round numbers to avoid glitches for floating point rounding errors
    const decimalPlacesTolerance = 8
    return Math.round(x * 10 ** decimalPlacesTolerance) / 10 ** decimalPlacesTolerance
}
```
and in `findAdjacentGaps`: `round(gap.length) === round(gapLength)`.

So there are **two separate numbers doing two separate jobs**: an 8px threshold governs *how close the pointer must be* to a candidate position, and exact equality governs *which existing gaps count as the same gap*. Do not conflate them.

### The perpendicular-overlap rule, in code

A gap only exists between two shapes when they are separated on one axis **and overlap on the other** — the same rule Figma states for Smart selection:

```ts
if (
    // is there space between the boxes
    startNode.pageBounds.maxX < endNode.pageBounds.minX &&
    // and they overlap in the y axis
    rangesOverlap(startNode.pageBounds.minY, startNode.pageBounds.maxY,
                  endNode.pageBounds.minY, endNode.pageBounds.maxY)
)
```

Note the loop is `for i … for j = i + 1 …` over shapes sorted by `minX`: gaps are formed between **every** qualifying pair, not just adjacent ones. That is a deliberate over-generation, cleaned up afterwards.

### Candidate-set control — four independent limits

`getSnappableShapes()` restricts candidates by:

1. **Viewport** — "Only consider shapes if they're inside of the viewport page bounds"
2. **Selection** — "Skip any selected ids"
3. **Per-shape opt-out** — the shape util's `canSnap()`
4. **Scope** — collection starts from `getCurrentCommonAncestor() ?? editor.getCurrentPageId()`, and "Snap to children of groups but not group itself"

(4) is the same-parent-only rule #142 already settled, arrived at independently.

### Noise control at draw time

Over-generated gap snaps are pruned by `dedupeGapSnaps()`, which sorts snaps by **descending gap count** and drops any whose edges are all already covered:

> "if every edge in this snap is included in the other snap somewhere, then it's redundant"

The heuristic worth stealing: **prefer the snap that explains the most gaps**. A four-gap match subsumes and silences the two-gap matches inside it, so a long evenly-spaced row draws one story, not six.

### Size snapping: absent, and emergent

`snapResizeShapes()` computes snap points from `getResizeSnapPointsForHandle()` (corners and edges) and emits only `type: 'points'` indicators (L614, L628) — **no gap or dimension snap runs during a resize**. As in Figma, matching a neighbour's width is a by-product of catching its edge, not a feature. In tldraw and Figma alike, **spacing and size are not one feature; size is not a feature at all.**

---

## 4. PenPot — the cautionary tale

PenPot is AGPL, so the algorithm is readable, and it is the most instructive entry here because its design produces exactly the failure mode #144 is worried about.

Files: `frontend/src/app/main/snap.cljs` (the math), `frontend/src/app/worker/snap.cljs` (a range-tree index in a Web Worker), `frontend/src/app/main/ui/workspace/viewport/snap_distances.cljs` (the drawn guides).

### Two different tolerances for two different jobs — and they don't match

```clojure
(def ^:const snap-accuracy 10)
(def ^:const snap-path-accuracy 10)
(def ^:const snap-distance-accuracy 20)
```
— <https://raw.githubusercontent.com/penpot/penpot/develop/frontend/src/app/main/snap.cljs>

Screen pixels, converted at the use site by dividing by zoom (`(/ snap-accuracy zoom)`). So edge/point snapping gets a 10 px halo, **equal-distance snapping gets 20 px — twice as loose** — and the "sit centred between a left and a right neighbour" case is looser still at ±40 px (`(* snap-distance-accuracy 2)`).

Meanwhile the *overlay* that explains the snap uses a completely different and far tighter test, in document units, not scaled by zoom:

```clojure
check-in-set
(fn [value number-set]
  (->> number-set (some #(<= (mth/abs (- value %)) 1.5))))
```
— `snap_distances.cljs`

**Consequence: PenPot can snap without drawing the guide that explains why.** If you take one lesson from this document, take that one — the detection threshold and the drawing threshold must be the same number.

### One coincidence is enough

`calculate-snap` splits the viewport (clipped to the containing frame) into four areas around the selection, queries the worker index for shapes on each side, and computes all pairwise gaps among them, restricted to pairs that overlap on the perpendicular axis (`#(overlap? coord %1 %2)` — the same rule again). Candidate gaps go into a range tree; the selection's own gap is queried ±tolerance, and the minimum correction wins (`(reduce min ##Inf snap-list)`).

There is **no requirement that three or more shapes already be evenly spaced**. A single pre-existing gap anywhere in the viewport, on the correct side, within 20 screen pixels, is enough to move you. That is the low bar, and it is why PenPot's issue tracker reads the way it does.

It **snaps automatically**, and when point-snapping and distance-snapping disagree, `combine-snaps-points` takes `mth/max-abs` per axis — **the larger displacement wins**. Worker queries are `(rx/throttle 100)`.

**No same-size snapping.** Snap points are only bbox corners, centre, and (for frames) edge midpoints; matching a width is again a side effect of edge alignment.

**Where it does not fire:** distance guides are suppressed inside auto-layout frames — `(when-not (ctl/any-layout? frame) ...)`. This is precisely the #141/#134 conclusion, already shipped by someone else.

The feature is behind a `:dynamic-alignment` toggle, on by default, alongside `:snap-guides`, `:snap-ruler-guides`, `:snap-pixel-grid`. The user docs describe it as: "If there are more than two layers nearby and you drag one of them Penpot will show their distance to help you distribute them equally" (<https://raw.githubusercontent.com/penpot/penpot/develop/docs/user-guide/designing/workspace-basics.njk>) — note the docs claim "more than two", which the code does not require.

### The complaints

- **[#1971 "Snap elements between them"](https://github.com/penpot/penpot/issues/1971)**: "When I move an element near of another one, I expect my element with try to snap on the near element, **not one out of the screen**… my `Rect-1` snaps with everything but my `icon`… it works slightly better if I zoom out, which makes no sense." That is the unbounded candidate set plus `max-abs` plus screen-space tolerance, all visible from the outside at once.
- **[#5311 "Hold ctrl while moving to remove snapping"](https://github.com/penpot/penpot/issues/5311)** (open): "I want to have snapping enabled by default but on the rare occasion i want to disable it for one element i dont want to go into a settings pane for that." **PenPot still has no modifier-key escape hatch.** This is their most-asked snapping request.
- PR #420, "Reduces the snap-distances feedback" — they have already had to dial the overlay back once.

## 5. Sketch — the most complete version of the feature

Sketch is the counter-example to Figma and tldraw: it does equal-gap snapping **and** equal-size snapping, live, during the gesture, and documents both.

> "As you move or insert layers and Symbols on the Canvas, the Mac app will automatically show you measurements against nearby layers, as well as Smart Guides that help you snap to a nearby layer's centre or edges."
>
> "If you have two or more layers next to each other, and move another near to them, we'll highlight their distance and **automatically snap that layer to distribute them all equally**."
>
> "When you resize a layer, if there are similar layers nearby we'll show you if they have a **similar width or height**. This also works when you're resizing a layer that's overlapping another."
>
> — <https://www.sketch.com/docs/interface-and-settings/the-mac-app-interface/the-canvas/>

Points worth extracting:

- **Two existing layers (one gap) is enough** to propose a third — same as tldraw's `gap_duplicate`, against Figma's blog's "three or more".
- It is an **automatic snap, not a suggestion**. Sketch also shows measurements *during* the drag, where Figma shows none.
- **Same-size snapping is a real feature**, fires on resize, and explicitly works even when the two layers overlap — i.e. it is not parasitic on edge alignment the way Figma's and tldraw's are.
- Guides are not hard-coded red: "You can change the colors of the measuring guides via the Canvas tab in Settings" (<https://www.sketch.com/docs/designing/layer-basics/selecting-layers/>).

**Explicit structure wins over inference.** "When you have a layout grid set up, layers will snap to it and **ignore** the Mac app's Smart Guides." A declared grid suppresses inference entirely — a clean priority rule.

**Smart Distribute** is Sketch's equivalent of Figma's smart selection, and is gated the same way:

> "With Smart Distribute you can quickly adjust even spacing between multiple layers… select two or more layers, then click and drag on the handle that appears between them."
>
> "**Smart Distribute won't appear if your layers aren't evenly distributed.** To fix this, you can either evenly distribute your layers manually or use the Tidy button."
>
> — <https://www.sketch.com/docs/designing/layer-basics/aligning-layers/>

(Introduced in Sketch 55, not 61 — "With Sketch 55, we introduced Smart Distribute to make managing and creating complex layouts easier", <https://www.sketch.com/blog/smart-distribute-cloud-documents-and-sketch-for-teams-whats-new-in-sketch/>. Sketch 56 added grids and negative spacing; Sketch 67 let the set span groups.)

**Noise control is screen-space, not model-space:**

> "For very small selections, or when you're zoomed far out from your selection, Smart Distribute handles will be hidden, making it easier to see the layers."

**And where two invariants genuinely conflict, Sketch asks rather than choosing.** Distributing when exact spacing and pixel alignment cannot both hold offers "**Distribute Unevenly**: maintain alignment at the pixel level, which may cause slight variations in how the layers are distributed" or "**Place on Sub-pixels**: make the distribution exact, which means placing the layers with sub-pixel level alignment." Compare Figma, which silently allows "up to 1px of rounding."

Note also the post-hoc Distribute command requires "more than three layers" — a different threshold again from the live snap's two.

---

## 6. Affinity Designer — inference is fine, the candidate set is the problem

Serif's answer treats equal-gap and equal-size as **one option**, and spends its design effort almost entirely on bounding what can be matched against.

> "**Snap to gaps and sizes** — when checked, arrows represent matched gaps between snapping candidates and matched horizontal and/or vertical sizes."
> — <https://affinity.help/designer2/English.lproj/pages/DesignAids/snapping.html>

One toggle, both behaviours, drawn as **arrows** (gap indicators) rather than lines. Guide semantics are colour-coded by axis and kind: "Red line: Object snaps to target horizontally. Green line: … vertically. Yellow node: … shape's key points (often centres) or geometry." Dynamic guides "include labels which report the distance between the snapping objects (**measured in the document's set units**)" — i.e. numbers *are* shown during the gesture, in document units.

### The candidate set: four independent limiters

> "Snapping candidates are page objects which are available for you to snap to. You can specify which objects are used in the snap, and eliminate the ones you are not interested in."

- **Candidate List** — "limits the number of objects which are snapping candidates to the number you set. **Creating a new object, or hovering over an existing object, designates it as a snapping candidate** in this case."
- **Maximum** — "limits the number of active candidates when Candidate List is selected… If you reach this limit, **new candidates replace older candidates in chronological order**." (An LRU cap. Serif does not publish the default value.)
- **Immediate layers** / **Immediate layers and children** / **All layers** — hierarchy scoping.
- Plus "Only snap to visible objects", a per-object **Exclude From Snapping** on the layer entry, and "Screen tolerance—controls the distance you have to be to an object before snapping occurs" (**screen** units, like tldraw).

The idea worth stealing is **recency as a proxy for intent**: the objects you just made or just hovered are the ones you probably mean, and everything else is silenced by default. And crucially the inferred set is made *visible* —

> "**Show snapping candidates** — when checked, highlights the active snapping candidates… Candidates will display a 'purple halo'."

— which turns "why did it snap to that?" from a mystery into something inspectable.

### Serif documents its own failure mode

> "If you have a document with a high number of objects or layers and activate the All layers snapping candidate option, you may experience performance issues when moving or resizing objects due to the shear number of snapping candidates." *(sic)*

Corroborated by their own bug forum: ["100% CPU usage with 'snap to gaps and sizes' enabled"](https://forum.affinity.serif.com/index.php?/topic/132696-100-cpu-usage-with-snap-to-gaps-and-sizes-enabled/). Gap inference is pair-wise and gets expensive fast — cf. tldraw's `for i … for j = i+1` over all shapes.

A second, subtler complaint: the pen tool's snapping is "completely independent of the 'global' Snapping option on the main toolbar", so the obvious off-switch does not work and users cannot find the real one (["Turn Off Guides and Snapping?"](https://forum.affinity.serif.com/index.php?%2Ftopic%2F17519-turn-off-guides-and-snapping%2F=)). **One feature, one off-switch.**

Snapping presets ship as workflow bundles: "Page layouts", "Page layouts with objects", "Object creation", "Curve drawing", "UI design", plus user-defined ones.

---

## 7. Platform tools — declare the relationship instead of inferring it

Neither Apple nor Google does continuous equal-spacing inference. Both convert a momentary gesture into a **durable declaration** that maintains the relationship afterwards.

**Android — chains.** (<https://developer.android.com/develop/ui/views/layout/constraint-layout>)

> "A chain is a group of views that are linked to each other with bi-directional position constraints."
> "**Spread:** The views are evenly distributed after margins are accounted for. This is the default."
> "**Spread inside:** The first and last views are affixed to the constraints on each end of the chain, and the rest are evenly distributed."
> "**Packed:** The views are packed together after margins are accounted for."

Equal spacing is a property of the layout, not of a drag. Where Android *does* infer, it is a discrete, invoked command — "**Infer Constraints** scans the layout to determine the most effective set of constraints for all views" — and the continuous variant is deliberately off: "**Autoconnect is disabled by default.**"

**Apple — Interface Builder,** which is unusually candid that positional inference is fragile:

> "Interface Builder creates the constraints based on the views' current frames. Therefore, you need to position the views carefully before you draw the constraints."
> "…because the constraint's values are inferred from the scene's current layout, **it is easy to end up off by a point**."
> "Interface Builder attempts to infer the best constraints given the view's current size and position in the canvas. **Be sure to position your views carefully—small differences in spacing can result in significantly different layouts.**"
> — <https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/AutolayoutPG/WorkingwithConstraintsinInterfaceBuidler.html>

The Pin/Align tools exist precisely so you need not rely on positional inference. Same-size is rendered as a **persistent labelled badge**, not a transient guide: "Interface Builder shows constraints that give two items an equal width or an equal height as a separate bar for each item. Both bars are tagged with a blue badge containing an equal (=) sign inside." Their guide vocabulary is worth borrowing wholesale: "**I-bars** (lines with T-shaped end-caps) show the size of a space… **Plain lines** show where edges align. **Solid lines** [are] required constraints (priority = 1000). **Dashed lines** [are] optional constraints (priority < 1000)."

And distribution is delegated to stack views, where the axis is inferred exactly once, at creation: "The system infers the stack's axis and alignment from the initial relative position of the views."

Reported failure modes are the sub-pixel-drift family — storyboards mutating by 0.5–1px and flagging views "misplaced", especially across retina/non-retina displays (<https://developer.apple.com/forums/thread/8116>) — the same problem Sketch surfaces honestly with its Distribute Unevenly dialog.

**This is the alternative design.** Mechanē already has it in the shape of auto-layout Frames (#134): inside one, spacing is `gap` and equal spacing is declared, not inferred. Which is exactly why #141 scopes equal-spacing snapping to absolute Frames only.

---

## 8. Inkscape — asymmetric tolerance, and the best idea in this document

Inkscape gained live equidistance snapping in 1.2: `src/distribution-snapper.cpp`, headed **"Snapping equidistant objects"** (Parth Pant, 2021) — <https://gitlab.com/inkscape/inkscape/-/raw/master/src/distribution-snapper.cpp>. It sits alongside a separate `alignment-snapper.cpp` with its own tolerance, so **alignment and distribution are two features with two thresholds**, not one.

Tolerances are screen pixels divided by zoom, same as everyone else:

```cpp
//returns the tolerance of the snapper in screen pixels (i.e. independent of zoom)
virtual Geom::Coord getSnapperTolerance() const = 0;
```
```cpp
Geom::Coord SnapManager::getSnapperTolerance(double tolerance) const
{
    double const zoom = dt ? dt->current_zoom() : 1;
    return tolerance / zoom;
}
```
— `src/snapper.h`, `src/snap.cpp`. There are **five independent tolerances** (`src/snap-preferences.h`): `_grid_tolerance`, `_guide_tolerance`, `_object_tolerance`, `_alignment_tolerance`, `_distribution_tolerance`.

### The asymmetric-tolerance trick

Candidates are bucketed by direction (`_bboxes_right/left/up/down`), sorted outward, restricted to a band extended from the dragged bbox, and overlapping neighbours are unioned into a single box first. `_findSidewaysSnaps` then walks a **chain** of equidistant boxes recursively and keeps the **longest** one:

```cpp
if (_findSidewaysSnaps(*next_bbox, ++it, end, result, first_dist, tol, distance_func, ++level)) {
    if (result.size() > max_length) {
        // if this item has the most number of items equidistant form each other
        // then make this the final result
        optimum_start = *next_bbox; max_length = result.size(); vec = result; dist = first_dist;
    }
}
```

The crucial detail: the loose tolerance applies **only at level 1** — the gap the user is currently forming. Deeper links must match essentially exactly, via `compare_double(dist, next_dist, level * DISTRIBUTION_SNAPPING_EPSILON)` with `#define DISTRIBUTION_SNAPPING_EPSILON 0.5e-4f`.

> **Inkscape is loose about your gap and strict about theirs.** PenPot is loose about both, and PenPot is the one whose bug tracker is full of "it snapped to something off-screen".

Other guards: chain depth capped (`level > 10`, `best_result.size() > 10`); it only fires from the bounding-box centre (`if (p.getSourceType() != SNAPSOURCE_BBOX_MIDPOINT) return;`); and it is constraint-aware — dragging vertically disables x-distribution.

**No same-size snapping.**

### Noise controls that are user-visible preferences

Defaults from `src/preferences-skeleton.h`: `snapdelay = 0`, `snapweight = 0.5`, `snapclosestonly = 0`, `snapindicator = 1`. From <http://tavmjong.free.fr/INKSCAPE/MANUAL/html/Snapping.html>:

> **Delay (in ms)**: "Sets the delay between the time the cursor stops moving and snapping is attempted. Useful if there are many snapping targets."
> **Only snap the node closest to pointer**: "Useful if an object has many snapping points."
> **Weight factor**: "If multiple snapping possibilities exist, the value of this parameter determines if the smallest distance between a snap point and snap target is favored (0.0) or if a snap using the closest snap point to the cursor is preferred (1.0)."

The **weight factor** is a genuinely different idea from everyone else's: a continuous dial between "snap to the nearest target" and "snap to what the pointer is nearest to". And the **snap indicator** always narrates itself: "a small cross will flash at the snapping site. Next to this indicator, a message indicates what snapping point and snapping target were used."

Note also `getSnapperAlwaysSnap()` — a per-snapper pref that makes a snapper ignore tolerance entirely.

### The post-hoc route

Align & Distribute (<http://tavmjong.free.fr/INKSCAPE/MANUAL/html/Align.html>) offers "Distribute with uniform gaps between objects" alongside centre/edge distribution, plus **Remove Overlaps** ("move objects just enough that they don't overlap… allow the addition of a minimum space") and **Unclump** ("move objects to more evenly space the edge-to-edge distances. Repeated application approaches… Distribute with uniform gaps"). Distribution holds the two extremes fixed.

### The complaints are the opposite shape

Inkscape's snapping issues are overwhelmingly *doesn't fire* and *is slow*, not *is too aggressive*: [#13758 "Snapping sometimes doesn't work"](https://gitlab.com/inkscape/inbox/-/work_items/13758), [#12693 "Snapping causes many minute freeze in a moderately sized file"](https://gitlab.com/inkscape/inbox/-/work_items/12693), #10911 "Disable snapping to locked layer", #12123 "Snapping label shows debug information instead of snap to information". Plausibly because everything is gated behind explicit per-target toggles in the snap bar, plus the delay and closest-only prefs. **You can buy a quiet feature with per-target toggles, and pay for it in discoverability.**

---

## 9. Blender — explicit modes, zero inference

Blender is the outlier and the useful contrast: it has **no equal-spacing concept at all**, and snapping never guesses. Everything is a mode the user sets, off unless toggled "or more temporarily by holding Ctrl" (<https://projects.blender.org/blender/blender-manual/raw/branch/main/manual/editors/3dview/controls/snapping.rst>).

The model is unusually explicit, and the vocabulary is worth borrowing:

- **Snap Base** — what moves: *Closest* ("bounding box corner … or vertex that's closest to the target"), *Center* (the pivot), *Median* ("average position of the selected objects' origins"), *Active*.
- **Snap Target** — what it snaps to: *Increment* ("an imaginary grid that starts at the selection's original location"), *Grid*, *Vertex*, *Edge*, *Face*, *Volume*, *Edge Center*, *Edge Perpendicular*, *Face Center*. "Multiple snapping modes can be enabled at once using Shift-LMB."
- **Affect** — "By default, snapping only happens while moving something, but it can also be enabled for rotating and scaling."
- Plus Include Active / Include Edited / Include Non-Edited / Exclude Non-Selectable.

Separating *what moves* from *what it snaps to* is the cleanest bit of modelling in this whole survey, and Mechanē's guide model has no equivalent axis today.

Equal spacing is absent: `Align Objects` only does Centers / Positive Sides / Negative Sides relative to Active / Selection / 3D Cursor / Scene Origin (<https://projects.blender.org/blender/blender-manual/raw/branch/main/manual/scene_layout/object/editing/transform/align_objects.rst>). Distribution is add-on territory — [Precision Drawing Tools](https://extensions.blender.org/add-ons/precision-drawing-tools-pdt/), the [Distribute](https://extensions.blender.org/add-ons/distribute/) extension — and both are post-hoc operators.

**The trade.** Blender's snapping never fires on a coincidence and is trivially disableable, because it never infers. The cost is that the mode is wrong until you configure it, and the target under the cursor is a hidden input — Blender's own devs note beginners "don't realize they're snapping to the target under the cursor and are surprised when things jump around" (<https://devtalk.blender.org/t/snapping-precision-modeling-improvements/28435>, <https://devtalk.blender.org/t/snapping-precision-modeling-improvements-new-defaults-snap-icons-and-removals/29985>).

---

## 10. Comparison

| | equal-gap during drag | equal-size | gaps needed to infer | tolerance | units | auto-snap or suggest | numbers shown while dragging |
|---|---|---|---|---|---|---|---|
| **Figma** | undocumented (badges exist) | ✗ (plugins) | blog says 3+, docs say 2+ | undocumented | — | snap | ✗ (opt-in hover mode) |
| **Sketch** | ✓ documented | ✓ documented | 1 ("two or more layers next to each other") | undocumented | — | "automatically snap" | ✓ |
| **tldraw** | ✓ | ✗ | 1 (`gap_duplicate`) | 8 px ÷ zoom; gap equality **exact** | screen px | snap | ✗ |
| **PenPot** | ✓ | ✗ | 1 | 20 px ÷ zoom (40 for centring); overlay 1.5 units | screen px | snap | ✓ (when drawn) |
| **Inkscape** | ✓ (1.2+) | ✗ | 1, but chain must be near-exact | `_distribution_tolerance` ÷ zoom, level 1 only; deeper `0.5e-4` | screen px | snap | via snap indicator text |
| **Affinity** | ✓ (`Snap to gaps and sizes`) | ✓ same toggle | undocumented | "Screen tolerance" | screen px | snap | ✓ ("document's set units") |
| **Blender** | ✗ | ✗ | — | modal | — | — | — |
| **IB / ConstraintLayout** | ✗ (declare a chain/stack) | ✓ as a **persistent constraint** | — | — | — | declare | badges, permanently |

---

## 11. Where the editors disagree — the real design choices

**1. Units. Everyone who ships this uses screen pixels divided by zoom; #142 settled canvas units for Mechanē.**
tldraw (`snapThreshold / getZoomLevel()`), PenPot (`(/ snap-accuracy zoom)`), Inkscape (`tolerance / zoom`), Affinity ("Screen tolerance") all agree, and they agree *against* Mechanē's settled position. This is not a reason to reverse #142 — the reasoning there (snapping is for tidiness, not pointer imprecision) is sound and the vendors' choice may just be inherited from mouse-precision-era snapping. But it should be a conscious disagreement, and note PenPot bug #1971's "it works slightly better if I zoom out, which makes no sense" is a *symptom* of the screen-space choice. Canvas units may be the better answer; nobody has tried it.

**2. How many gaps make a pattern. This is the noisiness dial, and the answers range from one to three.**
Every live implementation reads a **single** pre-existing gap as sufficient (tldraw `gap_duplicate`, PenPot, Sketch "two or more layers next to each other"). Only Figma's *blog* says three, and Figma's three applies to a different feature (post-hoc smart selection), not to drag-time snapping. Requiring three would be the quietest choice available and nobody has shipped it live.

**3. Symmetric vs asymmetric tolerance — the single best idea found.**
Inkscape is loose about *your* forming gap and near-exact about whether the *other* objects already form a pattern (`level * 0.5e-4`). PenPot is loose about both (20 px, 40 px) and its bug tracker is the result. tldraw takes the extreme version of Inkscape's position: gap equality is *exact*, with rounding only for float noise. Recommendation on the evidence: **two numbers, one generous, one exact.**

**4. Detection threshold vs drawing threshold.**
PenPot uses 20 screen px to snap and 1.5 document units to draw, so it snaps silently. This is a straight bug in the design, and it is the cheapest thing to get right: **one number, used for both.**

**5. Which snap wins when several compete.**
- PenPot: largest displacement (`max-abs`) — hard to defend.
- tldraw: prefer the snap explaining the most gaps, at draw time (`dedupeGapSnaps` sorts by descending gap count).
- Inkscape: longest equidistant chain wins, plus a user-facing **weight factor** dial between "nearest target" and "nearest to pointer".
- Figma: for post-hoc distribute, the **mode** of the existing gaps.

Longest-chain/most-gaps is the consensus of the two best implementations. PenPot's is the counter-example.

**6. Are size and spacing one feature or two?**
Three answers. **Affinity: one** (`Snap to gaps and sizes`, a single toggle). **Sketch: two behaviours, both real, undivided in the UI.** **Figma, tldraw, PenPot, Inkscape: spacing only** — same-size is emergent from edge snapping and is not a feature. Given #142 shipped edge/centreline guides, Mechanē already has the emergent version for free, which argues that same-*size* is the lower-value half and can be dropped or deferred separately from same-*gap*. Note Sketch's same-size explicitly works on overlapping layers, i.e. where the emergent version cannot help — that is the whole marginal value of building it.

**7. Numbers during the drag.**
Sketch, PenPot and Affinity show measurements as you drag; Figma and tldraw show none, and Figma puts numbers behind a deliberate opt-in modifier+hover mode. #142's "no measurements in v1" lands with Figma and tldraw. Affinity is worth noting as the middle position: labels "measured in the document's set units", not screen px.

**8. Inference vs declaration.**
Apple and Google refuse to infer continuously; they turn the gesture into a durable constraint (chain / stack view / `=` badge) that maintains itself afterwards. Figma's Smart Selection and Sketch's Smart Distribute are the halfway house — inference is used only to *recognise* an invariant that already holds, and then a persistent manipulation UI appears. Both **gate the affordance on the invariant already being true**, and both tell you to run Tidy Up first if it isn't. Mechanē already has the declarative answer for the common case (auto-layout `gap`, #134), which sharpens the question: is drag-time equal-gap snapping worth it *only* inside absolute Frames, where auto layout was rejected?

**9. What actually causes the complaints.**
Not detection quality — candidate-set size and escape hatches:
- Serif documents its own O(n²) blow-up ("performance issues… due to the shear number of snapping candidates") and has a matching bug report on `Snap to gaps and sizes` specifically pegging 100% CPU.
- Inkscape has an open multi-minute-freeze bug from synchronous candidate collection; PenPot mitigates with a Web Worker range tree and 100 ms throttle.
- PenPot's top snapping request is a hold-to-disable modifier it still lacks. Figma, Blender and Affinity all have one.
- Figma users complain about guides firing against **locked** objects; Inkscape users about **locked layers**. Both are candidate-set bugs, not algorithm bugs.

**10. Anti-noise rules everyone converged on independently**, and which cost nothing:
- **Perpendicular overlap required** — Figma (Smart selection), tldraw (`rangesOverlap`), PenPot (`overlap?`). Two objects at opposite corners are not a row.
- **Viewport clipping** — tldraw, PenPot, Inkscape's band restriction.
- **Same-parent / common-ancestor scoping** — tldraw's `getCurrentCommonAncestor()`, Affinity's "Immediate layers". Already settled in #142.
- **Explicit structure suppresses inference** — Sketch: a layout grid makes layers "ignore… Smart Guides". PenPot: distance guides are off inside auto-layout frames. Already implied by #141.
- **Per-object opt-out** — Affinity's "Exclude From Snapping"; tldraw's `canSnap()`.
- **Screen-size suppression** — Sketch hides Smart Distribute handles for tiny selections and at low zoom.
- **Make the candidate set visible** — Affinity's purple halo; Inkscape's snap-indicator text naming the source and target. The one thing that turns "why did it do that?" into something a user can fix.
