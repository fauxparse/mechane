# Presence

An application for building interactive tech for live theatre shows across multiple devices, including projectors, laptops, and audience mobile phones.

## Language

### Show

The top-level project a director or technician builds in Presence. A Show is a directed graph of Scenes, Devices, Flows, Sources, Transformers, and the wiring between them.
_Avoid_: Project, production

### Run

A discrete live instance of a Show. Starting a Run resets all live data (the values held by Sources) to their defaults; Devices connect to a Run, not directly to the Show, when a performance is underway. A Show has zero or more Runs, but at most one Run is active at a time.
_Avoid_: Session, performance, instance

### Scene

A named visual unit designed to be displayed on a Device. A Scene has a Canvas, plus Variables that can be connected to Sources in the Show graph and Cues that respond to Events.
_Avoid_: Screen (code term), page, slide. Matt sometimes says "screen" conversationally when he means Scene — treat it as shorthand, not a different concept.

### Canvas

The element tree owned by a Scene or Block — a hierarchy of Elements with a single root container. The canvas editor operates on a Canvas directly, without knowledge of whether it belongs to a Scene or a Block.
_Avoid_: Element tree, layer tree, stage

### Device

A named physical endpoint in the venue — a projector, laptop, or audience phone — that displays Scenes and can emit events. Devices are active participants, not passive displays.
_Avoid_: Display, screen, endpoint

### Flow

A named group of Scenes that behaves as a state machine, always with one active Scene. Navigate Actions transition the Flow from one Scene to another.
_Avoid_: Sequence, section, route

### Variable

A typed, named value on a Scene or Block. Scene Variables can receive a value from the Show graph via wiring, or hold a literal default. Block Variables define the values a Slot maps into a Block instance. Variables are the bridge between external data and visual content.
_Avoid_: Input (code term), parameter, field. Note: an older unrelated concept called "Variable" has been removed from the codebase.

### Source

A node in the Show graph that holds or produces data — a raw value, object, or array. Sources are wired to Scene Variables or Transformers.
_Avoid_: Source node, value, data source

### Transformer

A node in the Show graph that transforms data from one form to another — via an expression or string formatting. Transformers take Sources (or other Transformers) as input and produce a new value.
_Avoid_: Operation, expression converter, computed node

### Element

A visual building block inside a Scene — a rectangle, text, image, frame, or other primitive. Elements can be nested and their properties can be connected to Variables.
_Avoid_: Layer, object, shape (shape is used for a different concept — see below)

### Property

An application-defined attribute of an Element (as opposed to a Variable, which is user-defined). Both Properties and Variables can take literal values, be connected to variables, or take an expression combining the two.

### Block

A reusable, named Scene template with typed Variables and Cues. Blocks can be instantiated inside Scenes and can contain other Blocks.
_Avoid_: Component (code term), template, widget, piece

### Slot

A placeholder element inside a Scene or Block that holds a Block instance. A Slot always contains a Block — never raw elements. A Slot may render a single Block instance or one instance per item in an array Variable.
_Avoid_: Repeater, list

### Event

A user interaction emitted by a Device — a tap, click, or keypress. Events originate either from a user interacting with an Element in the displayed Scene, or from a physical peripheral (Bluetooth keyboard, buzzer) connected to the Device. Events are connected to Cues.
_Avoid_: Trigger, signal

### Cue

A named trigger that lives on a Scene or Block and fires one or more Actions when a connected Event or direct nested Block Cue occurs. Events can originate from Elements within the Scene or from the Device displaying it. A Cue can have conditions that gate whether it fires.
_Avoid_: Interaction (code term), trigger, event handler

### Action

An individual operation within a Cue — for example, navigating to a Scene, evaluating an expression, or incrementing a value. A Cue may contain multiple Actions that fire in order.
_Avoid_: Step, command

### Shape

A show-scoped type definition that describes the structure of a data object — its fields, their types, and defaults. Shapes are used when Sources hold structured data.
_Avoid_: Type (code term), schema, model, shape

### Wiring

The act of connecting a Source or Transformer to a Scene Variable via a directed edge in the Show graph. "Wiring" and "connecting" are interchangeable; "wiring" is more precise in technical contexts.
_Avoid_: Patching, routing, mapping

### Connecting (at Scene level)

Connecting a Variable to an Element property so that the property value updates dynamically. Uses the same conceptual model as wiring at the Show level.
_Avoid_: Binding (acceptable as a synonym), linking

## Relationships

- A **Show** contains one or more **Scenes**, **Devices**, **Flows**, **Sources**, and **Transformers**
- A **Scene** belongs to one **Show** and has zero or more **Variables**
- A **Canvas** belongs to one **Scene** or **Block** and contains that owner's hierarchy of **Elements**
- A **Flow** groups one or more **Scenes** and tracks a current active **Scene**
- A **Device** displays one **Scene** at a time
- A **Source** or **Transformer** is wired to a **Variable** via the Show graph
- A **Variable** can be connected to one or more **Element** properties within a **Scene** or **Block**
- A **Scene** owns a **Canvas** that contains a hierarchy of **Elements**
- An **Element** can be a **Slot**, which instantiates a **Block**
- A **Block** has zero or more **Variables** and zero or more **Cues**
- **Events** are emitted either by **Elements** within a **Scene** (user taps, clicks) or by the **Device** displaying the **Scene** (peripheral keypresses, buzzers)
- A **Cue** lives on a **Scene** or **Block** and fires its **Actions** when a connected **Event** or direct nested **Block** **Cue** occurs
- A **Cue** contains one or more **Actions**
- A **Slot** maps parent **Variables** or runtime context into child **Block** **Variables**
- A **Shape** defines the structure of data held in a **Source**
- Audience members connect their phones to a **Device** by scanning a QR code or entering an alphanumeric code; their individual sessions are not tracked — interactions are aggregated
- A **Show** has zero or more **Runs**; starting a **Run** resets live data to defaults, and **Devices** connect to the active **Run**

## Example dialogue

> **Director:** "So if I want to show the current vote tally on a Scene, I create a Source with a Shape that has a `count` field, wire it to a Variable on the Scene, and then connect that Variable to a text Element's content?"
> **Tech:** "Exactly. And if the tally updates during the show, the Scene updates live because the Variable is connected."
> **Director:** "And if I want the audience to trigger a transition — say, clicking a button on their phone moves to the next Scene in the Flow — that's a Cue on the button Element with a navigate Action?"
> **Tech:** "Right. You can also add conditions to the Cue so it only fires if, say, a minimum number of votes have been cast."
