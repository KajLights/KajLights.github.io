# Website purpose and content review — 30 October 2026

KajLights helps people learn electronics, computing and networking by making
things with microcontrollers. Understanding how a circuit, a program and messages
work together gives people more ideas for what to build. It also helps them
make specific requests to AI and judge whether the result does what they intended.

The shared [project and learning goals](https://github.com/KajLights/lightvm/blob/main/docs/project-goals.md)
record this direction for the website and LightVM. This review was informed by
Found in Space's home, About, Question and Learn & Build website sources, and its
mission: give people material to explore, understand and create with. KajLights
applies that approach to circuits and computers.

## Writing and activity principles

- Start with something the visitor can do or imagine: make a door signal, move a
  light or send a command. Explain the relevant idea through that example.
- Use ordinary language and concrete verbs. Introduce technical terms where
  they help explain a job, such as a protocol's rules for exchanging messages.
- Treat electronics, computing and communications as connected subjects. Coding
  lessons alone do not fulfil the project purpose.
- Make the first build achievable for a child of about ten with an adult helper.
  Connect the lights, change a colour and follow a question. Keep buying,
  firmware preparation and detailed electrical checks in helper notes.
- Keep each page focused on its task. The build page builds hardware; the Learn
  page also offers browser activities. A later experiment introduces a component
  because it has a useful job, not because the introduction needs more detail.
- Use practical feedback to correct the guide. Do not turn every correction
  into a prominent anecdote, warning or extra restriction. The first Pico build
  uses USB VBUS power, GND and a direct GP16-to-DIN connection. It does not impose
  an arbitrary LED count or require extra signal components.
- Demonstrate the AI rationale with a specific request and an observable test.
  The countdown example describes colours, timing and completion; the learner
  can predict particular frames and compare them with the result.
- State availability where it affects the next step. The existing browser
  lessons, prepared-board activities and developer-level network extensions
  need different preparation. Educational aims are not evaluated outcomes.

## Coverage

| Surface | Result of the review |
| --- | --- |
| Home | Explains the purpose with door signals, countdowns and moving lights; connects three subjects to actions; retains boards, build routes and concise early-testing status. |
| Learn | Gives activities with actions, observations and explanations: power versus data, colour mixing, time and memory, independent execution, USB versus Wi-Fi, and MQTT. Replaces the abstract AI prompt with a testable countdown request. |
| About | States the educational purpose, the role of understanding when building with AI, the relationship to Found in Space, current material and the intended first-build audience. |
| Build | Preserves the three-wire USB build and diagrams. Removes the LED-count anecdote and repeated personal hardware reports. Uses colour signals, movement and independent execution as extensions. Keeps electrical checks beside their wiring steps and detailed help in expandable notes. |
| Hardware | Explains processor, memory and flash by their jobs; keeps exact board identification, photographs, manufacturer links and firmware availability. |
| Install and Releases | Explains firmware, feature choices and clean installation in direct language. Keeps the distinction between installed firmware and editable lighting programs. |
| Device workspace | Simplifies explanatory text, empty states and feature labels. Installation, device checks, warnings about erasure and behaviour are unchanged. |
| Shared layout and metadata | Describes the learning purpose consistently in the page titles, descriptions and footer. |
| Image credits | Retains source attribution and licence information; describes the three wiring diagrams without a personal hardware anecdote. |
| Project documentation | Adds the shared learning goals to LightVM and links them from its README, documentation index, teaching guide and website implementation plan. |

The public website is built from `src/`. Retired Jekyll files in `docs/` are not
published. The technical release-policy documentation remains a maintainer guide.
No application version, runtime behaviour or firmware acceptance policy changes
are part of this content review.

## Further learning material

The twelve programming lessons are available now. The hardware and network
activities are a smaller collection, and network setup still uses developer
guides. Next curriculum work should make circuit measurement, message tracing
and connection-loss behaviour practical to explore with learners. This review
does not claim to have delivered or evaluated a complete course in those areas.
