# Team document coverage

All references below point to headings in development-plan.md. The extracted original is included as original-framework.txt. The user's later instructions additionally require generated practice scenes, full scope now, and lightweight verification.

| Original requirement | Handoff location |
|---|---|
| Stereographic fear/current-ability → timed practice; critical thinking/problem solving; nonclinical framing; speaking/interview/trail/confinement examples | Authority and delivery; Describe the situation and ability; Desired example cases |
| Spark coordinator: intensity, timer, narrator, setting/sound/feedback tools | Model roles; Coordinate and construct; Contracts |
| Spark table's contradictory build-time-only statement | Explicit resolution in Model roles, following Core Engagement Loop |
| Wonder environment / 3D or image scene from setting/intensity/props | Model roles; SceneSpec schema |
| Glimmer ambient/SFX beds, ramps, whoosh; royalty-free/Spark fallback | Model roles; AudioPlan schema |
| Transcribe commands, yes/no, builder, description, reflection; listen windows | Model roles; Complete interaction specification |
| Optional SAM head-direction idea and permission to omit | Model roles; gyro-versus-camera clarification retained |
| Optional Image fallback; Muse Code build-time-only | Model roles |
| Voice-first interaction | Global presentation and controls |
| Every page transition preloader, destination tips, wind whoosh | Global presentation and controls |
| Portrait pause until landscape | Global presentation; STOP and State sections |
| Initial tips loader; preset 3D forest parallax with atmospheric depth | Launch and lobby |
| Simultaneous royalty-free piano and forest/wind | Launch and lobby |
| Contrasting START text | Launch and lobby, exact text |
| Headset check, portrait prompt, voice confirmation | Headset setup, exact prompt |
| Fear and current ability intake | Describe the situation and ability |
| Relevant SESSIONS history, opt-in prompt, no repeated question for chained session | Describe the situation and ability, exact prompt |
| Coordinator context, input, goals, ideal outputs, tool suite, OpenAPI | Coordinate and construct; Contracts; openapi.json |
| Specialist schemas, coherent setting/sound, decisions stable unless user input | Coordinate and construct; specialist schemas |
| Setup narration / hey builder | Coordinate and construct, exact narration; repeated additions supported |
| Setup's first STOP tip | Global presentation; Coordinate and construct, exact text |
| Usually a few minutes; ten-minute recovery ceiling | Coordinate and construct a complete scene, then validate and load it |
| Eight-second black intro including STOP; black fade and blurry-to-clear scene | Introduction and timed experience |
| STOP immediately pauses; black-tinted overlay / white Quit simulation?; YES skips / NO resumes | STOP section, exact text and semantics |
| Coordinator-chosen countdown | Intake; Introduction; SessionPlan schema |
| Self-report | Self-report and optional reflection |
| Optional spoken/transcribed reflection, Reflections folder, date/time/topic<=30 filename | Self-report; Reflection schema, exact display naming and portable-file mapping |
| Optional feedback question; agent/OpenAPI | Optional agent feedback; Feedback schemas |
| Here's what you did well: <=3 positive | Optional agent feedback |
| I also noticed: <=3 positive/negative; small actionable improvement if relevant | Optional agent feedback |
| Save SESSIONS spreadsheet; conservative columns, topics and numbers for cross-session review | Save and adapt/repeat; SessionRecord schema |
| Adapted repeat question or original START screen | Save and adapt/repeat, exact prompt; Adaptation schemas |
| NSFW, human interaction, malicious intent | Edge cases; Dialogue schemas and scene mechanics |
| Native iPhone/Cardboard demo, no web compromise, cable install without paid program | Team machines, signing, installation, and demo |
| Henry Mac/Xcode; Richard Windows/WSL/xtool | Both installation paths with prerequisites |
| USB Trust, Apple ID Personal Team, device selection/Run; unplug launch | Henry path and first-use instructions |
| WSL USBIPD, Xcode.xip SDK, authentication, xtool dev, Swift pipeline | Richard path, with verification caveats |
| Developer Mode/restart; VPN & Device Management developer trust | Henry path, shared with Richard path |
| ~7-day profiles/rebuild; paid distribution vs free cable install; goggles hold phone | Signing/fees |
| USB-C/Lightning, wireless optional, installed icon opens unplugged | Henry path |
| Before demo: signing, mic/STOP, audio, gyro/orientation, charge, DND, volume, landscape, optional low-power setting | Before each rebuild/demo |
| Install ahead, cable optional, start outside goggles, help hold, backup phone/laptop | Live demonstration |
| Recovery reconnect/Run/xtool, team estimate ~1–2 minutes | Live demonstration |

Implementation additions include scene graphs, runtime validation, TTS, dialogue turns, audio mixing, atomic persistence, stale-result handling, and adaptation dimensions. These support the source requirements. Hardware/provider facts remain to be verified, not presented as established capabilities.

## Authoritative addendum clarifications

- Spark runtime role explicitly corrected; Muse Code alone is build-time-only.
- Generation and native readiness have a ten-minute hard ceiling; internal retries share it. Prefer concise valid output and useful scene detail so ordinary descriptions finish in a few minutes.
- Reflection display filename is `[DATE] [HH:MM] - [TOPIC <=30 chars]`.
- Coordinator has scalar intensity_1_10, short topic, intro/STOP/audio brief, interaction mode, and an enforced safety decision.
- Tool calls carry typed specialist arguments and execution phase.
- Session records/CSV include early-end and explicit history/chain flags.
- Active-practice builder is labeled an extension; setup builder remains required.
- Approximately three-minute submission video and judging focus are included without narrowing product scope.

## Scene-quality addendum coverage

| Scene-quality requirement | Engineering translation |
|---|---|
| Foreground/midground/far, fog, real stereo, no flat world | Scene authoring contract §1; shared model prompt |
| Visible unoccluded task_focus after reveal | Contract §2; both-eye loaded-scene visibility check |
| Finished components/assets, character behaviors, no placeholders | Contract §3; asset/assembly metadata and rendered quality checks |
| Mode-backed dialogue/navigation/mixed/solo interactions | Contract §4; existing IDs, choices/events, native turn bindings |
| Node/draw/asset caps; optimize without changing task | Contract §5; actual phone profile and resolved render counts |
| Matching revision, valid IDs/routes, app-owned stereo | Contract §6; checks repeated after optimization |
| One bounded repair, explicit paths, retry/revise/cancel | Contract §7; existing ValidationIssue and shared attempt deadline |
| Coordinator/Wonder receive explicit authoring instructions | scene-authoring-prompts.md |

This addendum adds authoring and client-validation rules only. SceneSpec/OpenAPI shape, endpoints, core loop, STOP, lobby, and demo/install paths remain unchanged.
