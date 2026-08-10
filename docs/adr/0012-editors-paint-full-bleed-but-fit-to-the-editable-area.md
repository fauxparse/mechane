# Editors paint full-bleed, but zoom-to-fit frames the Editable Area

Both the Show Editor and the Canvas Editor fill the entire viewport, flowing underneath the floating sidebars and toolbar to the edges of the screen. The Editor Chrome sits above them, not beside them. But every zoom-to-fit frames its target within the Editable Area — the region the Chrome leaves visible — not within the viewport it is painted into.

The alternative was to let `SidebarInset` clip the editors, so painted area and fit area were the same rectangle and no inset plumbing was needed. We rejected it: an editor that stops at the sidebar edge makes the sidebars look bolted on rather than floating, and a graph or Artboard sliced off at a hard vertical line reads as a bug. Painting full-bleed is the whole point of the layout. The cost of that choice is that painted extent and usable extent diverge, and anything that positions content by calculation has to know the difference.

So the divergence is made explicit rather than left implicit. The layout owns the Editable Area and publishes its insets through context; the editors consume them. An editor rendered with no layout around it — in Storybook, or in isolation — sees an all-zero inset and behaves exactly as it did before, which is what keeps the mock-up reviewable without a router or a query client.

The insets are **computed from sidebar widths and open state, not measured from the DOM.** Measuring the real element is truthful but reports a value that changes on every frame of a sidebar's slide transition, so a fit requested mid-animation would frame a rectangle that no longer exists by the time the animation lands. Computing from the target state means a fit always frames where the Chrome _will_ be. Fit animations share the sidebar's transition duration token so that, when both move at once, they read as one motion.

Collapsing or expanding a sidebar deliberately does **not** re-fit. It changes the Editable Area for the _next_ fit and leaves the current viewport alone. Re-fitting on toggle would yank the viewport away from a user who had panned somewhere on purpose, and the sidebar toggle is not a request to reframe anything.

Consequences: fit entry points take an inset rather than reading a module-level constant, which is why the Show Editor's duplicated `FIT_VIEW_OPTIONS` collapses into one inset-aware helper. React Flow's per-side `Padding` type carries the inset directly. The Canvas Editor has no fit logic yet; it consumes the Editable Area for nothing today, and will use the same context when fit is built for it.
