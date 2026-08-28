---
name: Voting
description: An app where audience members can vote on their phones, and the results are tallied and displayed on a projector
---

**Note:** Some of the functionality below (notably navigation and events) is currently not implemented. **This is fine.** Just build as much as you can and leave the rest, with the assumption that future iterations will build it out more fully.

# Shapes

## Candidate

A candidate has a `name`, a `votes` count (starts at 0), and an `image`. There is a single source node of type `array of Candidate` containing three candidates: Alice, Beatrix, and Clarissa. I've included their images as named `.png` files in this directory.

# Flows

## Audience flow

A flow containing three screens, wired to a `perConnection` device.

### Candidate list

Takes an array of `candidates` and displays them as a list of buttons (make a `CandidateButton` block that takes a `Candidate` name as input and renders a rectangle with a solid background and rounded corners; render these as a vertical list in a slot with appropriate gap). Tapping one of these buttons takes the user to a confirmation screen.

### Confirmation screen

Shows a confirmation message and yes/no buttons. Tapping "no" returns the user to the candidate list; tapping "yes" increments the selected candidate's `votes` and takes the user to a thank you screen

### Thank you screen

Just displays a nice message

## Projector flow

There's no need for this to be a flow, just a single root screen that takes an array of `candidates` and renders a list of names and vote counts. Use a `TallyRow` block and render it in a slot with the array wired to the input so the block is repeated.

# Design

The design should use large text and bright colors. The screens in the Audience flow should be sized for mobile (360x720) and the projector screen should be HD (1920x1080).
