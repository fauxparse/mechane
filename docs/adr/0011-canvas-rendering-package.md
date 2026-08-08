# Canvas rendering lives in a dedicated package

Canvas, Scene, Block, and Slot rendering is content, not application chrome. The React/DOM + CSS renderer therefore lives in `@mechane/rendering`, separate from `@mechane/design-system`.

`@mechane/rendering` owns the shared Canvas and Element rendering primitives, their stories, and their focused rendering tests. Studio's Scene preview and Player's Device client consume the same package and must not maintain host-specific renderer implementations. `@mechane/design-system` remains responsible for theme tokens and application-chrome components.

This boundary keeps the renderer usable by both authoring and playback without coupling content rendering to the design-system's UI surface.
