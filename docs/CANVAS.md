# Diagram Canvas Specification v1

## Vision

Build a browser-based diagram editor inspired by:

- draw.io
- Visio
- PowerPoint
- Java Swing desktop tooling
- Flash / ActionScript authoring tools
- RAD tools such as Visual Basic 6, Delphi, Excel, and VBA

The editor should feel like a powerful desktop application: visual, direct-manipulation oriented, scriptable, inspectable, and fast.

Primary goals:

- Infinite canvas
- Drag-and-drop editing
- Connectors and ports
- Rich shape manipulation
- Strong undo/redo architecture
- Serializable document model
- Extensible object system
- PowerPoint-like editing capabilities
- Future-friendly animation and scripting architecture

---

# Architectural Principles

## 1. Undo/Redo First

Undo/redo is a foundational architectural concern.

It must not be added later.

All user actions should be represented as commands.

Examples:

- Create node
- Delete node
- Move node
- Resize node
- Rotate node
- Create connector
- Reconnect connector
- Change style
- Change layer
- Group
- Ungroup
- Change text
- Change timeline keyframe
- Change animation properties
- Change script/event handler

Each command must support:

```typescript
execute()
undo()
redo()
```

All document mutations must flow through the command system.

No direct mutation of document state from UI interactions.

Benefits:

- Undo/redo
- Future collaboration support
- Macro recording
- Audit trail
- Time travel debugging
- Timeline/keyframe editing
- Scriptable automation

---

## 2. Serialization First

The entire document must be serializable.

Requirements:

- JSON representation
- Deterministic structure
- Versioned schema
- Backwards compatibility strategy

Document example:

```typescript
{
  version: 1,
  pages: [],
  assets: [],
  styles: [],
  symbols: [],
  scripts: [],
  timelines: []
}
```

Everything required to reconstruct a document must exist in serialized form.

No hidden runtime state.

This enables:

- Save/load
- Autosave
- File export
- Copy/paste
- Future cloud sync
- Testing
- Animation playback
- Script execution
- Timeline editing

---

## 3. PowerPoint Mental Model

The editor should support diagramming but also lightweight presentation-style editing.

Users should be able to:

- Place arbitrary objects
- Align objects
- Distribute objects
- Group objects
- Layer objects
- Duplicate objects
- Resize objects
- Rotate objects
- Add text anywhere
- Arrange slides/pages
- Reuse symbols/components
- Apply themes/styles

Think:

```text
PowerPoint + draw.io + Flash authoring + RAD builder
```

rather than:

```text
Pure diagramming tool
```

---

## 4. Everything Is an Object

Connectors, ports, groups, guides, layers, pages, timelines, scripts, and selections should all have explicit identities and participate in serialization where appropriate.

Avoid special-case rendering hacks that cannot be saved, undone, inspected, scripted, or animated.

---

## 5. Future Animation-Safe Model

Even if animation is not part of the MVP, the data model should not prevent it.

Objects should be designed so their properties can later be animated.

Animatable properties may include:

- Position
- Size
- Rotation
- Opacity
- Fill color
- Stroke color
- Text
- Visibility
- Connector endpoints
- Layer visibility
- Z-order
- Custom properties

This implies that object properties should be addressable by stable paths.

Example:

```typescript
{
  objectId: "shape-1",
  property: "position.x",
  value: 120
}
```

---

# Canvas

## Infinite Canvas

Support:

- Pan
- Zoom
- Infinite grid illusion
- World coordinates
- High DPI displays

---

## Grid

Support:

- Minor grid
- Major grid
- Snap to grid
- Grid visibility toggle

Grid should remain crisp under zoom.

---

# Pages / Slides

Documents should support multiple pages.

Because PowerPoint-like functionality is a goal, pages should also be treated as slides.

Requirements:

- Add page
- Delete page
- Duplicate page
- Rename page
- Reorder page
- Page thumbnails
- Page background
- Page size / bounds, optional
- Freeform infinite-canvas mode, optional
- Presentation ordering

Each page owns:

- Shapes
- Connectors
- Layers
- Timeline, optional future
- Page-level scripts, optional future

---

# Layers

Layers are required in v1 architecture.

Layers become painful if added later.

Each object belongs to exactly one layer.

Layer properties:

```typescript
{
  id,
  name,
  visible,
  locked
}
```

Supported operations:

- Create layer
- Delete layer
- Rename layer
- Reorder layer
- Hide/show layer
- Lock/unlock layer

Future support:

- Layer groups
- Layer filtering
- Layer-level animation
- Layer-level scripting

---

# Shapes

Initial shape types:

- Rectangle
- Rounded rectangle
- Circle
- Ellipse
- Line
- Text
- Icon
- Container

All shapes derive from a common base type.

```typescript
Shape
```

Properties:

```typescript
id
type
position
size
rotation
style
text
layerId
customProperties
```

---

# Selection

Support:

## Single Selection

- Click to select

## Multi Selection

- Shift-click
- Marquee select

## Selection State

Selected objects show:

- Outline
- Handles
- Ports

---

# Resize Handles

Each selected object displays:

- Top-left
- Top
- Top-right
- Right
- Bottom-right
- Bottom
- Bottom-left
- Left

Future:

- Rotation handle
- Skew handle
- Timeline/keyframe indicators

Visual style:

Swing-inspired beveled squares.

---

# Ports

Ports are first-class objects.

They must not be treated as a rendering hack.

Port types:

- Top
- Bottom
- Left
- Right
- Center
- Corner
- Perimeter

Ports should support:

- Visibility rules
- Snapping
- Hover states
- Connector attachment
- Stable IDs
- Serialization
- Future animation/scripting hooks

---

# Connectors

Required connector types:

- Straight
- Orthogonal

Future:

- Curved
- Smart-routed

Connector requirements:

- Port-to-port connection
- Shape attachment
- Automatic updates when shapes move
- Endpoint dragging
- Arrowheads
- Labels

---

# Drag and Drop

Supported interactions:

## Shape Creation

Drag from palette onto canvas.

## Shape Movement

Drag existing objects.

## Connector Creation

Drag from source port to target port.

## Reconnection

Drag connector endpoint.

## Marquee Selection

Drag selection rectangle.

## Canvas Pan

Drag background.

Interaction priority:

```text
Handle
→ Connector
→ Shape
→ Selection
→ Canvas
```

---

# Text Editing

Text should be a first-class feature.

Requirements:

- Double-click to edit
- Inline editing
- Rich positioning
- Auto sizing

Future:

- Rich text
- Bullets
- Hyperlinks
- Text animation
- Data-bound text

PowerPoint-like text editing should be possible.

---

# Alignment and Layout

Required in MVP.

Support:

## Align

- Left
- Center
- Right
- Top
- Middle
- Bottom

## Distribute

- Horizontal
- Vertical

## Snap

- Grid
- Object edges
- Object centers

---

# Grouping

Required in MVP.

Operations:

- Group
- Ungroup

Groups behave as a single object while preserving child structure.

Groups should remain serializable and undoable.

---

# Clipboard

Support:

- Copy
- Cut
- Paste
- Duplicate

Clipboard should use serialized document fragments.

---

# Object Ordering

Required.

Support:

- Bring forward
- Send backward
- Bring to front
- Send to back

PowerPoint-style ordering.

---

# Rendering

Canvas rendering stack:

```text
Background
Grid
Connectors
Shapes
Selection
Ports
Handles
Drag Preview
Editing Overlay
Timeline Preview, future
```

Recommended implementation:

- Canvas 2D renderer
- DOM overlay for text editing
- Optional SVG or Canvas icons

---

# Styling

Visual direction:

Classic desktop application.

Inspired by:

- Java Swing
- Metal Look and Feel
- Nimbus Look and Feel
- Classic visual editors
- PowerPoint editing surfaces
- Flash authoring UI
- Visual Basic / Delphi property panels

Characteristics:

- Light gray panels
- Beveled controls
- Blue selection outlines
- Small utility-style icons
- Minimal animation
- Dense but clear tooling

Avoid:

- Flat SaaS aesthetic
- Heavy shadows
- Excessive rounded corners
- Mobile-first styling

---

# Save and Load

Required early.

Document operations:

- New
- Open
- Save
- Save As

File format:

```text
JSON
```

Future:

- Compression
- Embedded assets
- Templates
- Package format for assets/scripts/timelines

---

# PowerPoint-Like Functionality

The editor should include presentation-authoring concepts from day one.

Required or early:

- Multiple pages/slides
- Page thumbnails
- Object alignment
- Object distribution
- Grouping
- Z-order controls
- Text boxes
- Shape styling
- Duplicate
- Copy/paste
- Basic themes/styles

Future:

- Presenter mode
- Slide transitions
- Master pages/slides
- Templates
- Speaker notes
- Page-level animation

---

# Flash / ActionScript-Like Stretch Goal

Animation should be treated as a major future direction.

This does not need to be implemented in MVP, but the architecture should avoid blocking it.

## Timeline

Future support:

- Timeline panel
- Frame/time ruler
- Playhead
- Scrubbing
- Keyframes
- Object tracks
- Property tracks
- Layer tracks
- Preview playback

Example timeline model:

```typescript
{
  id: "timeline-1",
  pageId: "page-1",
  durationMs: 5000,
  tracks: [
    {
      objectId: "shape-1",
      property: "position.x",
      keyframes: [
        { timeMs: 0, value: 100, easing: "linear" },
        { timeMs: 1000, value: 300, easing: "easeOut" }
      ]
    }
  ]
}
```

## Tweening

Future tween support:

- Linear
- Ease in
- Ease out
- Ease in/out
- Step
- Custom curves

Tweenable properties:

- Position
- Size
- Rotation
- Opacity
- Color
- Text
- Visibility
- Connector endpoints

## Symbols / Components

Flash-style symbols are a valuable architectural concept.

Future support:

- Reusable symbols
- Symbol instances
- Instance overrides
- Nested symbols
- Library panel
- Replace symbol
- Edit symbol in isolation

This overlaps with PowerPoint templates and RAD components.

---

# RAD Tooling Stretch Goal

The editor should borrow the best parts of Excel, VBA, VB6, Delphi, and classic RAD environments.

## Property Inspector

Every selected object should expose editable properties.

Examples:

- Name
- Type
- Position
- Size
- Layer
- Fill
- Stroke
- Text
- Ports
- Connector behavior
- Custom properties

This should be schema-driven where possible.

## Object Naming

Objects should have stable, user-editable names.

Examples:

```text
Button1
Rectangle3
Connector12
CustomerCard
```

Names should support scripting and inspection.

## Event Model

Future support for object-level events:

- onClick
- onDoubleClick
- onHover
- onDragStart
- onDragEnd
- onConnect
- onDisconnect
- onPageEnter
- onPageExit
- onTimelineStart
- onTimelineEnd

## Scripting

Future support for scripting should be considered architecturally.

Possible scripting goals:

- Macros
- Event handlers
- Calculated properties
- Document automation
- Custom commands
- Data binding

The MVP does not need scripting, but the document model should allow scripts to be stored, versioned, disabled, inspected, and removed.

Example:

```typescript
{
  id: "script-1",
  language: "javascript",
  targetId: "shape-1",
  event: "onClick",
  source: "alert('Clicked')",
  enabled: true
}
```

## Data Binding

Inspired by Excel/VBA/RAD tools.

Future support:

- Bind object text to data
- Bind visibility to data
- Bind style to data
- Bind connector labels to data
- Formula-like properties

Example:

```typescript
{
  objectId: "label-1",
  property: "text",
  expression: "=Customer.Name"
}
```

---

# MVP Scope

Must include:

- Infinite canvas
- Grid
- Pages/slides
- Layers
- Rectangle
- Circle
- Text
- Selection
- Resize handles
- Ports
- Connectors
- Drag/drop
- Undo/redo
- Save/load
- Alignment tools
- Grouping
- Clipboard
- Object ordering
- Serializable object model

---

# Architecture-First, Implementation-Later Features

These do not need to ship in MVP, but the system should be designed so they are possible without a rewrite:

- Timeline
- Keyframes
- Tweening
- Playback/scrubbing
- Symbols/components
- Property inspector
- Object naming
- Event handlers
- Scripting
- Data binding
- Formula-like properties
- Master slides/pages
- Themes
- Templates

---

# Deferred Features

Not required initially:

- SVG export
- PNG export
- Real-time collaboration
- Curved connectors
- Rich text formatting
- Smart routing
- Minimap
- Presentation mode
- Full scripting runtime
- Full animation editor

These should remain architecturally possible but not block v1 delivery.

---

# Non-Negotiables

The following must be considered from day one:

- Undo/redo command model
- Serializable document model
- Stable object IDs
- Pages/slides
- Layers
- Z-order
- Grouping
- Ports/connectors as first-class model elements
- PowerPoint-like object manipulation
- Future timeline/animation compatibility
- Future property inspector/scripting compatibility
