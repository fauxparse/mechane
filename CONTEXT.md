# Mechanē

An application for building interactive tech for live theatre shows across multiple devices, including projectors, laptops, and audience mobile phones.

## Language

### Show

A top-level project a director or technician builds in Mechanē. A Show is a directed graph of Scenes, Devices, Flows, Sources, Transformers, and their wiring, plus reusable Blocks.
_Avoid_: Project, production

### Run

A discrete live instance of a Show. Starting a Run resets all live data (the values held by Sources) to their defaults and initializes each Flow-driven Shared Device's runtime Scene from the published Flow default; Devices connect to a Run, not directly to the Show, when a performance is underway. A Show has zero or more Runs, but at most one Run is active at a time.
_Avoid_: Session, performance, instance

### Scene

A named visual unit designed to be displayed on a Device. A Scene has a Canvas, plus Variables that can be connected to Sources in the Show graph and Cues that respond to Events.
_Avoid_: Screen (code term), page, slide. Matt sometimes says "screen" conversationally when he means Scene — treat it as shorthand, not a different concept.

### Canvas

The element tree owned by a Scene or Block — a hierarchy of Elements with a single root container. The canvas editor operates on a Canvas directly, without knowledge of whether it belongs to a Scene or a Block.
_Avoid_: Element tree, layer tree, stage

### Device

A named physical endpoint in the venue — a projector, laptop, or audience phone — that displays Scenes and can emit Events. A Shared Device represents one logical runtime instance whose state is shared by all its connections; a per-connection Device represents one logical instance per connection. Devices are active participants, not passive displays.
_Avoid_: Display, screen, endpoint

### Flow

A named group of Scenes that behaves as a state machine. Its optional default Scene initializes Flow-driven Device runtime state for a Run; the active runtime Scene belongs to the Run-scoped Device instance. Navigate Actions transition that instance from one Scene to another.
_Avoid_: Sequence, section, route

### Variable

A typed, named value on a Scene or Block. Every Variable has a Type; an untyped Variable is invalid. Scene Variables can receive a value from the Show graph via wiring, or hold a literal default. Block Variables define the values a Slot maps into a Block instance; each Block Variable has a required or optional input contract, and optional inputs may have typed defaults. Variables are the bridge between external data and visual content.

### Source

A node in the Show graph that holds or produces typed data. A Source has an
authored Source Default and, during a Run, a separate Current Source Value.
Sources are wired to Scene Variables or Transformers.
_Avoid_: Source node, value, data source

### Source Default

The authored Structured Value Template or simple value used to initialize a
Source when a Run starts and to service an explicit reset. It follows the
Show's draft/publish lifecycle; editing it never implicitly changes live data.

### Current Source Value

The complete, conforming value a Source holds in one active Run. Actions and
explicit Studio live editing change it immediately without changing the
Source Default. Runtime reads never merge it with authored defaults.

### Transformer

A node in the Show graph that transforms data from one form to another — via an expression or string formatting. Transformers take Sources (or other Transformers) as input and produce a new value.
_Avoid_: Operation, expression converter, computed node

### Element

A visual building block inside a Scene — a rectangle, text, image, frame, or other primitive. Elements can be nested and their properties can be connected to Variables.
_Avoid_: Layer, object, shape (shape is used for a different concept — see below)

### Stacking order

The order of sibling Elements within their parent. It determines which Element paints on top of which and, inside an auto-layout Frame, where an Element sits in the layout — one order, both meanings. "Bring forward" and "send to back" move an Element through it.
_Avoid_: Z-index, depth, paint order

### Layers

The navigator panel listing every Canvas and the Elements inside it. A UI surface only — never a synonym for Element or Canvas, which is why the panel is called Layers but the things in it are Canvases and Elements.
_Avoid_: using "layer" for an individual Element

### Artboard

The positioned, sized rectangle on the Canvas Editor's infinite plane that presents one Canvas. An Artboard is framing, not content: it has a place and a size, while the Canvas it presents has an element tree. Zoom-to-fit frames Artboards; it never frames Canvases.
_Avoid_: Frame (a kind of Element), page, board, using "Artboard" and "Canvas" interchangeably

### Show Editor

The surface for editing a Show's graph — its Scenes, Devices, Flows, Sources, Transformers, and the wiring between them. Reached by the "Show" tab.
_Avoid_: Graph editor, node editor

### Canvas Editor

The surface for editing the Canvas of a Scene or Block, presented as Artboards on an infinite plane. Reached by the "Scenes" tab.
_Avoid_: Art editor, workspace, stage

### Editor Chrome

The application furniture wrapped around whichever editor is open: the Show name and its menu, the Show/Scenes tabs, the user menu, the live-run control, the sidebars, and the toolbar. Chrome is never content — it belongs to no Show and is not part of what a Device displays.
_Avoid_: Shell, frame, header (the header is one part of the Chrome, not all of it)

### Editable Area

The region of the screen bounded by the Editor Chrome — the part of the editor a user can actually see and work in, as opposed to the part running underneath the sidebars and toolbar. Both editors paint edge to edge, but every zoom-to-fit frames its target within the Editable Area, so fitted content lands where it can be worked on rather than beneath the Chrome.
_Avoid_: Safe area, inset (reserved for the measurements that define the Editable Area), viewport (reserved for the editor's camera)

### Property

An application-defined attribute of an Element, as opposed to a Variable, which is user-defined. A Property has one current value mode: a literal value or a connection to a Variable.

### Property Connection

The relationship that makes an Element Property take its value from a Variable owned by the Scene or Block containing the Element.

### Property Coercion

The unique typed conversion derived from a Variable's Type and a Property's Type that makes the Variable value usable by that Property, such as converting a number to text. Coercion rules are explicit and extensible rather than implicit renderer behavior; the selected rule is not stored on the Property Connection.

### Block

A reusable, named Canvas template with typed Variables, named States, and Cues. Blocks can be instantiated inside Scenes and can contain other Blocks.
_Avoid_: Component (code term), template, widget, piece

### Slot

A transparent layout container Element inside a Scene or Block that holds a Block instance. A Slot always contains a Block — never raw Elements. A Slot may render a single Block instance or one instance per item in an array Variable. Its instance configuration includes one Slot Input Assignment per Block Variable and its own Frame-like layout configuration.
_Avoid_: Repeater, list

### Slot Layout Container

The invisible container through which a Slot participates in its parent layout and arranges its rendered Block instances. It always uses auto layout, supports the complete Frame layout contract except absolute mode and paint properties, and has sizing independent from the Block instance it contains.

### Nested Block

A Block instantiated by a Slot inside another Block or Scene. Nested Blocks render in the Slot's position and receive only the values and runtime context explicitly supplied by that Slot.

### Block Reference Graph

The directed relationship formed by Blocks referencing other Blocks through Slots. The graph may have arbitrary finite depth but cannot contain a direct or indirect cycle; State selection and runtime data do not change that structural rule.

### Runtime Context

The current item value supplied by an enclosing Array Expansion. A nested Slot may consume it explicitly; a deeper Array Expansion replaces it with its own current item, while explicitly mapped Block Variables preserve values that must cross that boundary.

### Invalid Slot

A Slot that cannot produce a valid Block instance because its Block reference, required input, assignment, field path, expansion source, or layout is invalid. Studio preserves its configuration and shows a diagnostic placeholder; Player renders the Slot blank without affecting its parent or siblings. An invalid repeated item is omitted while valid siblings remain.

### Slot Diagnostic

A structured explanation of an Invalid Slot or omitted repeated item, identifying the failing reference, input, path, source, or item. Unmatched State Selectors are not Slot Diagnostics because they select the Default State.

### Slot Input Assignment

The value a Slot supplies to one Block Variable: a literal, a parent Variable value, a runtime-item value, or unset. A literal takes precedence over the Block Variable's default; unset invokes the Block Variable's required or optional input contract.

### Input Field Path

A sequence of Shape Field names used to select a nested value for a Slot Input Assignment. Field names are scoped by their containing Shape and are the mapping identity; a deliberate Field rename updates affected assignments, while a deleted or unavailable path remains invalid until repaired.

### Array Expansion

The Slot behavior that renders one Block instance for each item in a compatible source value. An actual array preserves its order; a scalar is treated as one item, and an empty array renders no instances.

### Structured Value Instance

An identity-bearing live value whose Type is a Shape or an array. Every nested
Shape and array is its own Structured Value Instance. Passing a complete
instance through wiring, Variable or Slot input, or an Action preserves its
identity; updates through any alias are observed by every holder. Creating,
constructing, or cloning an instance is explicit, never an incidental
consequence of crossing a graph boundary. Simple typed values retain value
semantics.

### Structured Value Template

An immutable authored Shape or array value used as a Source default, Action
literal, or other design-time value. Materializing a template creates live
Structured Value Instances; the live Run never mutates the template.

### Shape Collection Instance

A Structured Value Instance whose reference appears as an item in an array.
It has no separate collection-only identity or value envelope. A Slot uses the
instance's identity, plus occurrence when the same reference appears more than
once, to reconcile repeated Block instances; simple array items retain
positional identity.

### State

A named variant of a Block's Canvas. A State inherits the Block's base Canvas and overrides values at any depth; values not overridden come from the base Canvas. One State is the default used when a selector does not match.
_Avoid_: Mode, screen, scene

### State Override

A sparse property-level change attached to a State and addressed by stable Element identity plus Property name. It replaces the complete Property value descriptor — literal or Variable connection — while preserving the Block's base Canvas structure. State Overrides may change any Element Property, including Frame layout properties, but never change Element membership, parentage, stacking order, or Slot instance configuration.

### State Selector

A distinguished text Variable on a Block that a Slot may populate through its ordinary input-mapping model. The resolved selector is compared with State names using case-insensitive exact equality; a missing, blank, or unmatched selector chooses the Block's designated default State.

### Default State

The one explicitly designated State used when a Block's State Selector has no usable match. Its State Overrides apply over the base Canvas like any other State; a Block with no named States renders its base Canvas directly.

A runtime user interaction emitted by a Device — a tap, click, or keypress. Events originate either from a user interacting with an Element in the displayed Scene, or from a physical peripheral connected to the Device. A runtime Event is transient; authored configuration uses an Event Binding.
_Avoid_: Trigger, signal

### Interaction Owner

The Scene or Block to which an authored interaction belongs. An Event Binding
derives its owner from the Canvas containing its Element, and a Cue belongs
directly to one owner. Only a Scene-owned Cue owns Actions; a Block-owned Cue
is an actionless event output exposed by each Slot that contains the Block.

### Event Binding

Authored configuration connecting an Element's Event kind to one or more Cues
owned by that Element's Canvas owner. Event Bindings have an explicit order;
runtime evaluation considers matching bindings in order and uses the first one
whose conditions match. `tap` is the first supported Event kind.
_Avoid_: Event handler

### Cue

A named, typed trigger owned by a Scene or Block. A Scene-owned Cue has an
ordered list of Actions, which may be empty. A Block-owned Cue has no Actions:
it is exposed as an Event on every Slot containing that Block and may be
relayed through containing Blocks until a Scene-owned Cue handles it.
_Avoid_: Interaction (code term), trigger, event handler

### Cue Parameter

A typed, named value carried by a Cue invocation. Bindings map values into Cue
Parameters explicitly; a Scene-owned Cue's Actions may read its Parameters.
Structured values retain their reference identity through every relay.

### Slot Event Binding

Authored configuration connecting a Cue exposed by a Slot's contained Block
to a Cue owned by the Slot's Canvas owner. It maps emitted Cue Parameters into
the target Cue's Parameters, and participates in the same ordered,
first-matching conditional fall-through model as Element Event Bindings.

### Action

An individual ordered operation within a Scene-owned Cue — for example,
navigating to a Scene, evaluating an expression, or updating a Source. A
Scene-owned Cue's Actions execute in their declared order; Block-owned Cues
never own Actions.
_Avoid_: Step, command

### Type

What kind of value something holds. Every Source, Variable and Transformer output has a Type — there is one type system across the whole Show, not a separate one per concept. A Type is either simple (text, number, boolean, image, color, date, datetime), a list of some other Type, or a Shape.
_Avoid_: Kind (used for the varieties of graph node), data type

### Shape

A named, show-scoped Type describing a structured object: an ordered list of Fields, reusable across as many Sources, Variables and Transformers as need it. A Shape's Field may itself be a Shape, but a Shape can never contain itself, directly or through another Shape.
_Avoid_: Schema, model, struct, record

### Field

One named slot within a Shape. A Field has a Type, a default, and is either required or optional. An optional Field may hold no value at all; a required one always holds one, which is why every Field has a default — starting a Run resets live data to defaults, and a Run must always begin in a valid state. Field names are unique within their Shape and are how expressions refer to them.
_Avoid_: Property (element term), attribute, column, key

### Wiring

The act of connecting a Source or Transformer to a Scene Variable via a directed edge in the Show graph. "Wiring" and "connecting" are interchangeable; "wiring" is more precise in technical contexts.
_Avoid_: Patching, routing, mapping

### Wiring Conversion

An explicit, recorded transformation a Wiring edge applies to the producer's
value before the ordinary Type compatibility and coercion rules apply. The
only Conversion is positional first-item selection, which lets an array Source
feed a single-valued target by taking position zero; reordering the array
changes which item travels, and an empty array delivers typed absence with a
diagnostic rather than a substitute item. A Conversion is stored on the edge
and validated at the graph boundary, never inferred from the endpoints.
_Avoid_: Adapter, cast, implicit conversion

### Connecting (at Scene level)

Connecting a Variable to an Element property so that the property value updates dynamically. Uses the same conceptual model as wiring at the Show level.
_Avoid_: Binding (acceptable as a synonym), linking

## Relationships

- A **Show** contains one or more **Scenes**, **Devices**, **Flows**, **Sources**, and **Transformers**, and zero or more **Blocks**
- A **Scene** belongs to one **Show** and has zero or more **Variables**
- A **Canvas** belongs to one **Scene** or **Block** and contains that owner's hierarchy of **Elements**
- A **Flow** groups one or more **Scenes** and has an optional design-time default **Scene**; active runtime Scene state belongs to a Run-scoped Device instance
- A **Device** displays one **Scene** at a time
- A **Source** or **Transformer** is wired to a **Variable** via the Show graph
- A **Wiring** edge has at most one **Wiring Conversion**; without one, the producer and consumer **Types** must be directly compatible
- A **Run** materializes each published **Source Default** into a separate **Current Source Value**; live Actions and Studio edits change the current value immediately, while default edits follow draft/publish
- A **Variable** can be connected to one or more **Element** properties within a **Scene** or **Block**
- An **Element** can have one or more ordered **Event Bindings** for each Event kind; multiple Elements may bind to the same **Cue**
- An **Element** can be a **Slot**, which instantiates a **Block**
- A **Scene** owns a **Canvas** that contains a hierarchy of **Elements**
- A **Block** belongs to one **Show**, owns one **Canvas**, and has zero or more **Variables**, **States**, and **Cues**
- A **Block** is referenced by stable identity independent of its user-facing name
- A **Slot** references one **Block** and stores that placement's configuration
- **Events** are emitted either by **Elements** within a displayed **Scene**, including Elements inherited from **Blocks** through **Slots**, or by the **Device** displaying the **Scene** (peripheral keypresses, buzzers)
- An **Event Binding** connects an Element's Event kind to a Cue owned by the Element's Canvas owner; matching bindings are evaluated in order
- A **Scene-owned Cue** owns ordered **Actions**; a **Block-owned Cue** is an actionless event output
  relayed by **Slot Event Bindings** until a Scene-owned Cue handles it
- Every binding supplies the target Cue's typed **Cue Parameters** explicitly; structured Parameters preserve reference identity
- A **Slot** maps parent **Variables** or runtime context into child **Block** **Variables**
- A **Slot** has at most one **Slot Input Assignment** for each child **Block Variable**; an assignment may be literal, sourced from a parent Variable, sourced from runtime context, or unset
- A **Slot Input Assignment** may select a nested value through an **Input Field Path** and uses the shared Type compatibility and coercion contract
- A **Slot** may use **Array Expansion** to render one Block instance per source item; a scalar source produces one instance and an empty array produces none
- A structured array item uses its **Structured Value Instance** identity for Slot reconciliation; repeated references add occurrence identity, while simple items retain positional identity
- Complete Shape and array values are **Structured Value Instances**: wiring, Variable and Slot input, and Actions preserve their reference identity; simple values retain value semantics
- Invalid source data invalidates the Slot, while an invalid individual item is omitted and does not prevent valid sibling instances from rendering
- Each repeated instance resolves its State independently and passes its current item as runtime context to nested Slots
- A **Slot** instantiates a **Nested Block** in its position; nested rendering is depth-first in Canvas and source order
- The **Block Reference Graph** is finite and acyclic; proposed direct or indirect cycles are rejected before persistence
- A nested Block receives only explicitly assigned Variables and the nearest applicable **Runtime Context**; ancestor Variables do not leak implicitly
- A **Slot** is a transparent layout container whose sizing, alignment, gap, padding, and clipping are independent from the sizing and internal layout of its Block instances
- An **Invalid Slot** is isolated from its parent and siblings; Studio preserves its configuration with a **Slot Diagnostic**, while Player renders its output blank
- An invalid repeated item is omitted without invalidating valid siblings, and a later valid value automatically recovers the Slot or item
- A Slot uses auto layout by default and cannot use absolute layout or visible paint properties; its wrapper participates in its parent as one Element
- A **State** has sparse **State Overrides** keyed by stable Element identity and Property name; overrides compose independently at any depth over the Block's base Canvas
- A **Block** may designate one text **Variable** as its **State Selector**, and each **Slot** may map a parent Variable or runtime context into it
- A Block with named States has exactly one **Default State**; State names use case-insensitive exact matching and missing, blank, or unmatched selectors use the Default State
- A **Source**, a **Variable** and a **Transformer**'s output each have a **Type**
- A **Shape** is a **Type**, made of an ordered list of **Fields**, each of which has its own **Type**
- A **Shape** may be reused by any number of **Sources**, **Variables** and **Transformers** within its **Show**
- Audience members connect their phones to a **Device** by scanning a QR code or entering an alphanumeric code; their individual sessions are not tracked — interactions are aggregated
- A **Show** has zero or more **Runs**; starting a **Run** resets live data to defaults, and **Devices** connect to the active **Run**
- An **Artboard** presents exactly one **Canvas**; the **Canvas Editor** shows one or more **Artboards** on its infinite plane
- The **Editor Chrome** wraps exactly one editor at a time — either the **Show Editor** or the **Canvas Editor** — and the tabs in it switch between the two
- The **Editor Chrome** bounds the **Editable Area**; collapsing a sidebar grows the **Editable Area** without moving what either editor is already showing

## Example dialogue

> **Director:** "So if I want to show the current vote tally on a Scene, I create a Source with a Shape that has a `count` field, wire it to a Variable on the Scene, and then connect that Variable to a text Element's content?"
> **Tech:** "Exactly. And if the tally updates during the show, the Scene updates live because the Variable is connected."
> **Director:** "And if I want the audience to trigger a transition — say, clicking a button on their phone moves to the next Scene in the Flow — that's a Cue on the button Element with a navigate Action?"
> **Tech:** "Right. You can also add conditions to the Cue so it only fires if, say, a minimum number of votes have been cast."
