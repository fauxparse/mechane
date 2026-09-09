---
name: Voting
description: An app where audience members can vote on their phones, and the results are tallied and displayed on a projector
---

**Note:** Some of the functionality below is not implemented yet. **This is fine.** Build as much as you can and leave the rest, on the assumption that future iterations will fill it in.

Events and navigation do work, including a tap inside a Block instance: tapping a candidate button sets `selected` and moves to the confirmation screen (#653). Two things below still do not work, and the seed should keep describing them as the Show wants them rather than working around them:

- The confirmation screen cannot display the selected candidate's name or image. A Player renders Show-scoped state only, so a Scene Variable wired to a Flow-local Source reads as empty (#654).
- Confirming a vote does not move the projector tally. The increment addresses a Show record through a Flow-local Source, and that Update is applied to the Player's own state instead of being sent to the server (#655).

# Shapes

## Candidate

A candidate has a `name`, a `votes` count (starts at 0), and an `image`. There is a single source node of type `array of Candidate` containing three candidates: Alice, Beatrix, and Clarissa. I've included their images as named `.png` files in this directory.

# Flows

## Audience flow

A flow containing three screens, wired to a `perConnection` device. There is also a Candidate-shaped source node called `selected`, which is initially empty.

### Candidate list

Takes an array of `candidates` and displays them as a list of buttons (make a `CandidateButton` block that takes a `Candidate` as input and renders a rectangle with a solid background and rounded corners, and the candidate's image and name; render these as a vertical list in a slot with appropriate gap). Tapping one of these buttons sets the value of `selected` to reference the selected candidate, and takes the user to a confirmation screen.

### Confirmation screen

Shows a confirmation message with the selected candidate's name and image and yes/no buttons. Tapping "no" clears `selected` and returns the user to the candidate list; tapping "yes" increments the selected candidate's `votes` on the server and takes the user to a thank you screen

### Thank you screen

Just displays a nice message

## Projector screen

There's no need for this to be a flow, just a single root screen that takes an array of `candidates` and renders a list of names and vote counts. Use a `TallyRow` block and render it in a slot with the array wired to the input so the block is repeated.

# Design

The design should use large text and bright colors. The screens in the Audience flow should be sized for mobile (360x720) and the projector screen should be HD (1920x1080).
