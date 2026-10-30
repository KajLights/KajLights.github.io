# Website content review — 30 October 2026

The review uses Found in Space’s website sources for its shared educational aim:
people can enter through play, investigation or making, then use understanding to
imagine possibilities, ask useful questions and assess results. KajLights applies
this to electronics, computing and networking through microcontrollers. Coding
is one part of that experience. AI can help make an idea, while understanding
helps someone formulate the request and judge the result; AI is not a prerequisite.

| Surface | Review outcome |
| --- | --- |
| Home | Introduces all three learning areas, the whole circuit/program/message system, imagination and AI, boards and early-testing status. |
| About | Explains the educational aims and the connection to Found in Space; distinguishes aspirations from evaluated outcomes and available features from future work. |
| Learn (new) | Offers concrete investigations in electronics, computing and communications, plus an example of asking AI for explanations and tests. Clearly separates existing browser lessons from early hardware/network prompts. |
| Build | Adds six identified board photographs, component pictures, anatomy notes, a power/data/ground diagram and equivalent text/table. Explains exact models, firmware availability, level shifting, power and first experiments. |
| Hardware | Replaces symbolic board artwork with model-specific photos; distinguishes chip capability from features enabled in firmware. |
| Install and Releases | Defines firmware and feature profiles in plain language and connects setup to the wider learning path. Existing availability checks and installation behaviour are retained. |
| Navigation and footer | Adds Learn and image credits; broadens the site description beyond programming. |
| Studio | Reviewed as the existing device-management tool; its working controls and implementation are unchanged. |
| Image credits (new) | Records primary sources, attribution, licences and display changes. |

The build guide is aimed at a child of about ten, working with an adult helper.
The first reward is a light and a colour change, followed by short, playful
challenges. Buying, firmware preparation, electrical specifications and diagnostic
instruments belong in optional helper sections, not in the first activity.

The quick Pico 2 W circuit sends GP16 straight to LED DIN, with no data resistor
or level shifter. It retains separate 5 V LED power, common ground and the power
input capacitor. Kaj’s successful direct drive, including long strips, is reported
as experience. His occasional ESP32-C3 flashing has no confirmed cause. Optional
investigations distinguish the first data lead from the regenerated pixel chain,
voltage margin from timing, and observations from guarantees. The later diagram
adds a 74AHCT125 module and data resistor, with a purpose for each part.

Raspberry Pi documentation, Worldsemi’s WS2812B datasheet, TI’s AHCT125 datasheet
and Adafruit’s direct-drive/power guidance support these explanations. Both
images show functional connections, not physical pin locations. This content
update does not constitute physical acceptance of a board, firmware build or
installation method.

The site remains experimental. It does not promise installable firmware where the
catalogue has none, public kaj-fi distribution, a completed electronics/networking
curriculum or measured learning outcomes. No application version changes are part
of this review.
