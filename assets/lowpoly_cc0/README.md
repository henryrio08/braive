# Low-poly CC0 practice assets

A curated set of **349 distinct model files** for a native iPhone stereographic VR practice app: speaking, interviews, audience practice, outdoor trails, and confined-space scene dressing. Every included model is a real downloaded asset; none was generated, reconstructed, remeshed, or fabricated. All deliverable models are self-contained glTF 2.0 binary (`.glb`) with embedded dependencies.

## License policy

**CC0 1.0 / public domain only.** Every model has exactly one provenance row in `LICENSE_INDEX.csv`, with `license=CC0-1.0`. The grant was checked on the exact source page and, where supplied, in the downloaded archive notice. `license_url` is the CC0 dedication URL; `source_pack_or_url` is the actual licensing/source page. Archive download URLs, hashes, and original notices appear below. CC-BY, CC-BY-SA, personal-use licenses, uncertain grants, branded/IP lookalikes, scans, and assets of uncertain generative origin are excluded. No account, purchase, or redistribution-restricting terms were required for the included downloads. No Sketchfab assets are included.

All included authors retain their authorship; CC0 does not require credit. The authors and source names are recorded for traceability. License uncertainties among included files: **none identified**.

## Inventory and scope

Count means **one independently importable model file**, not material groups, triangles, alternate export formats, or animation clips. Some original assets are modular components or multipart models. There are 544 internal glTF mesh definitions across the 349 model files; those internal definitions are not counted as extra assets.

| Category | Model files |
| --- | ---: |
| character | 4 |
| furniture | 60 |
| architecture | 108 |
| nature | 60 |
| urban | 38 |
| interior_prop | 39 |
| confined | 25 |
| audience | 15 |
| **Total** | **349** |

One subcategory never exceeds 20 files. Exact and near-identical geometry checks ignored materials and uniform scale; redundant shapes and alternate formats were not added as extra models. Functional modular shapes, different silhouettes, and fittings remain. Several source candidates were deliberately omitted after visual review.

`character/base` contains **exactly one** gender-neutral stylized humanoid: Plewr's original `characterRIGGED.glb`, with one skin skeleton, 9,344 triangles, T pose, no animation clips, and the glTF default solid white material. No texture/PBR wardrobe is present. `character/crowd_proxy` contains three separately shaped Kenney figures with rigid-part node animation (27 clips each), **not** skinned rigs.

Every prop has at most **2,272 triangles**, calculated from rendered scene geometry; the skinned base has 9,344. Triangulation counts include material primitives. Low triangle counts alone do not establish iPhone frame rate: test draw calls, transparency, stereo rendering, and simultaneous instances in the app.

## Empty subcategories

These directories are intentionally present and empty; no placeholder or non-CC0 replacement was added.

| Subcategory | Gap |
| --- | --- |
| furniture.podium | No suitable verified/downloadable CC0 lectern or speaking podium obtained. |
| interior_prop.whiteboard | Located examples carried CC-BY or unsuitable/unverified provenance; excluded. |
| confined.elevator_car | No suitable verified/downloadable CC0 low-poly elevator car obtained from the allowed sources. |
| confined.elevator_panel | No suitable verified/downloadable CC0 elevator control panel obtained. A generic wall switch was not relabeled as one. |
| confined.vent | A CC0 Office Air Vent archive was found, but its model was Blender-only. No validated GLB export was produced, so it is excluded. |

## Under-filled subcategories

For reporting only, “under-filled” means **fewer than five** assets, except `character.base`, whose required target is exactly one. The request did not specify other per-subcategory minimums.

| Subcategory | Included | Limitation |
| --- | ---: | --- |
| character.crowd_proxy | 3 | Three blockout silhouettes; rigid-part animations only. |
| furniture.desk | 3 | Two office desks and one explicitly labeled rustic workbench. |
| nature.trail_marker | 3 | Three generic signposts; blank signs need app-provided content. |
| urban.bench | 3 | Three seating forms from the furniture pack. |
| interior_prop.laptop | 1 | One simple open laptop. |
| interior_prop.mic | 1 | One microphone with stand from the concert pack. |
| audience.seat_row | 2 | Two tiered bleacher models; no dedicated auditorium chair-row mesh. |
| audience.curtain | 2 | Two domestic curtain forms; no large theatrical curtain. |
| furniture.podium | 0 | See empty-subcategory table. |
| interior_prop.whiteboard | 0 | See empty-subcategory table. |
| confined.elevator_car | 0 | See empty-subcategory table. |
| confined.elevator_panel | 0 | See empty-subcategory table. |
| confined.vent | 0 | See empty-subcategory table. |

## How Codex should import

1. **Scan the tree.** Treat the extracted `assets/` directory as the input root. Discover every `.glb` beneath the specified category/subcategory directories. Ignore README and CSV as model input. Preserve the empty directories and gap information in authoring tools.
2. **Validate provenance before copying.** Parse the CSV using an actual CSV parser, including quoted commas in notes. Require one row per discovered GLB, no duplicate path or ID, no unlisted GLB, safe relative paths with no traversal, `format=glb`, and `license` exactly `CC0-1.0` (or require a separately reviewed explicit public-domain license if the importer later supports additions). Require a source URL, license URL, author, timestamp, positive triangle count, positive scale, and consistent category/subcategory/filename. Reject unknown or blank licenses. This pack's URL pairs and notices are the evidence; don't infer a license from the author's name.
3. **Validate GLB bytes.** Check glTF 2.0 headers, declared lengths, valid buffers/accessors, embedded textures, and successful loading. Keep source skins, materials, named animations, and scene hierarchy. Do not bake away the base skeleton or silently drop animated nodes. Read the per-file notes for modular components and source-export repairs.
4. **Copy into the app Asset catalog.** For an Xcode `.xcassets` catalog, store each GLB as an opaque Data Set (`<id>.dataset/<filename>.glb`, plus `Contents.json`). A dataset's `Contents.json` can use `{"data":[{"filename":"<filename>.glb","idiom":"universal"}],"info":{"author":"xcode","version":1}}`. Load it with `NSDataAsset(name: id)`. An Asset catalog stores the bytes; it does **not** itself make glTF a native RealityKit/SceneKit model. Choose a glTF-capable loader or a tested build-time conversion to a supported Apple 3D format. Preserve and verify skinning, animation, materials, and scale through any conversion. Do not merely rename `.glb` to `.usdz`.
5. **Emit a JSON manifest** containing at least `id`, `path`, `tags`, and `scale` for each included asset. Derive `id` from the filename stem (including its category/subcategory prefixes), `path` from the actual destination relative to the catalog root, `tags` by splitting CSV tags on `;`, and numeric `scale` from `suggested_scale_m`. Keep a runtime mapping from `id` to `NSDataAsset`; catalog paths are build-time paths, not ordinary runtime bundle-file URLs. Preserve optional metadata such as license, source, category, and triangle count as useful.

Example manifest record (an actual included model):

```json
{
  "id": "character.base.neutral_humanoid_01",
  "path": "character.base.neutral_humanoid_01.dataset/character.base.neutral_humanoid_01.glb",
  "tags": ["character", "base", "low_poly", "vr_practice", "rigged"],
  "scale": 0.1
}
```

## Coordinates, scale, materials, and runtime notes

- `y_up=true` means the deliverable uses the glTF Y-up coordinate convention. No forward-facing orientation guarantee is made across authors.
- **`suggested_scale_m` means meters per one source-coordinate unit**: a scalar uniform import multiplier. It is not the model's height. For example, the base's approximately 17.93 source-unit height multiplied by 0.1 gives about 1.79 m. Suggestions are scene-layout estimates, not author-certified physical measurements. Inspect the source XYZ extents recorded in each row and tune VR scale on-device.
- Source pivots and offsets generally remain as published. Where useful, parent the loaded asset under an app placement entity, uniformly scale once, and calculate an optional XZ-center/min-Y placement offset from the complete asset bounds. Do not independently reposition bones or animated parts.
- Architecture includes modular parts: some stair models are handrails/supports, some ceiling assets are explicitly labeled original roof modules, and some window assets include surrounding wall geometry. Inspect their original-name notes when assembling rooms.
- Bleachers are bleachers, curtains are domestic curtains, and vehicles are stylized generic proxies. No asset is being claimed as a complete elevator, auditorium, or finished scene.
- Materials and original palette colors are retained. Some surfaces are transparent or double-sided. The base uses an untextured solid material. Other props are allowed their original flat materials/palette atlases.
- Concert props were extracted from the author's combined glTF, retaining each original mesh, material assignments, and node scale. Display-grid translation was removed and a root placement offset centers XZ and grounds Y. No mesh geometry was rebuilt. Stage scale suggestions favor a speaking-practice room.
- Original OBJ+MTL exports were converted into self-contained GLB with triangulation and original material colors retained; no remeshing or simplification. Palette textures referenced externally by some original GLBs were embedded. Older nature GLBs had a scene root referencing a child of an identity `tmpParent`; the identity parent was made the valid scene root. Per-file notes record these changes.

## Validation performed

All included GLBs load successfully and pass **Khronos glTF Validator with zero errors**. One warning is retained in the unchanged rigged base: `NODE_SKINNED_MESH_NON_ROOT` for its skinned mesh node. Its rig is preserved, but test how your chosen loader applies parent transforms and scale to skinned meshes. No iPhone/device runtime or animation-retargeting test was performed. Every file was included in a visual contact-sheet inspection; selected original geometry, material grants, and rig metadata were additionally checked. Four unrelated cladding pieces and five canister-like containers were omitted after review rather than placed under misleading subcategories.

The final archive was checked for file/CSV parity, valid category paths, naming, per-subcategory caps, complete metadata, embedded dependencies, CC0-only rows, triangle limits, and ZIP integrity.

## Included sources and license evidence

The following table enumerates **only sources whose actual model files are included**. Kenney and Quaternius archives were downloaded from their creator-uploaded CC0 OpenGameArt pages after the current Kenney download endpoint refused requests. The source-page URL is recorded in every relevant CSV row. Poly Pizza model pages were checked, but their downloads could not be retrieved here and no Poly Pizza-only files are claimed as included. The concert models were instead obtained directly from iPoly3D's CC0 OpenGameArt pack.

### furniture-kit

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/furniture-kit
- Included model files: 42
- Downloaded UTC: 2026-10-31T21:35:38.337226+00:00
- Actual archive download: https://opengameart.org/sites/default/files/kenney_furniturePack.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `68afa4e6dc8a53942379fb47f1e84ec735d46b77bb1c1ceb968e245693dde067`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
Furniture Pack (1.0) Exclusive

	Created/distributed by Kenney (www.kenney.nl)

			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	This content is free to use in personal, educational and commercial projects.

	Support us by crediting (Kenney or www.kenney.nl), this is not mandatory.

			------------------------------

	Donate:   http://support.kenney.nl
	Request:  http://request.kenney.nl
	Patreon:  http://patreon.com/kenney/

	Follow on Twitter for updates:
	@KenneyNL
```

### lowpoly-house-interior-pack

- Author: Quaternius
- Source/licensing page: https://opengameart.org/content/lowpoly-house-interior-pack
- Included model files: 61
- Downloaded UTC: 2026-10-31T21:37:22.990954+00:00
- Actual archive download: https://opengameart.org/sites/default/files/ultimate_house_interior_pack_-_june_2020.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `e59e14f0c2f57c6e5d3a057a77deeb7416c4fe3a6bdc5f27c8431f8a0bd7bbbb`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

The creator-uploaded source page explicitly marks the pack CC0; no separate bundled notice was located.

### space-station-kit

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/space-station-kit
- Included model files: 34
- Downloaded UTC: 2026-10-31T21:35:48.373588+00:00
- Actual archive download: https://opengameart.org/sites/default/files/kenney_space-station-kit.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `215e79bd5415cff93665183390f0343ed9acf87780306331013b78520170c6d8`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
Space Station Kit (1.0)

	Created/distributed by Kenney (www.kenney.nl)
	Creation date: 10-04-2024 13:50
	
			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	You can use this content for personal, educational, and commercial purposes.

	Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

			------------------------------

	• Website : www.kenney.nl
	• Donate  : www.kenney.nl/donate

	• Patreon : patreon.com/kenney
	
	Follow on social media for updates:

	• Twitter:   twitter.com/KenneyNL
	• Instagram: instagram.com/kenney_nl
	• Mastodon:  mastodon.gamedev.place/@kenney
```

### survival-kit

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/survival-kit
- Included model files: 18
- Downloaded UTC: 2026-10-31T21:35:48.323427+00:00
- Actual archive download: https://opengameart.org/sites/default/files/kenney_survival-kit.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `c3586341b5932c87eb43d75d915434f47daed168b17ed36a03e8ca9977c7443e`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
Survival Kit (2.0)

	Created/distributed by Kenney (www.kenney.nl)
	Creation date: 03-04-2024 14:59
	
			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	You can use this content for personal, educational, and commercial purposes.

	Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

			------------------------------

	• Website : www.kenney.nl
	• Donate  : www.kenney.nl/donate

	• Patreon : patreon.com/kenney
	
	Follow on social media for updates:

	• Twitter:   twitter.com/KenneyNL
	• Instagram: instagram.com/kenney_nl
	• Mastodon:  mastodon.gamedev.place/@kenney
```

### building-kit

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/building-kit
- Included model files: 50
- Downloaded UTC: 2026-10-31T21:35:37.493582+00:00
- Actual archive download: https://opengameart.org/sites/default/files/kenney_building-kit.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `b46e4fc873d02dad2ab2153846ede6cc242208e751b778d37f4e75bce23cb2be`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
Building Kit (1.0)

	Created/distributed by Kenney (www.kenney.nl)
	Creation date: 19-06-2024 14:56
	
			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	You can use this content for personal, educational, and commercial purposes.

	Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

			------------------------------

	• Website : www.kenney.nl
	• Donate  : www.kenney.nl/donate

	• Patreon : patreon.com/kenney
	
	Follow on social media for updates:

	• Twitter:   twitter.com/KenneyNL
	• Instagram: instagram.com/kenney_nl
	• Mastodon:  mastodon.gamedev.place/@kenney
```

### prototype-kit

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/prototype-kit
- Included model files: 24
- Downloaded UTC: 2026-10-31T21:35:48.632280+00:00
- Actual archive download: https://opengameart.org/sites/default/files/kenney_prototype-kit.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `213b522fb12bcc9b9ac66c4f7581f7c74623293272212e40a70c39936ad3da95`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
Prototype Kit (1.0)

	Created/distributed by Kenney (www.kenney.nl)
	Creation date: 28-08-2024 09:59
	
			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	You can use this content for personal, educational, and commercial purposes.

	Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

			------------------------------

	• Website : www.kenney.nl
	• Donate  : www.kenney.nl/donate

	• Patreon : patreon.com/kenney
	
	Follow on social media for updates:

	• Twitter:   twitter.com/KenneyNL
	• Instagram: instagram.com/kenney_nl
	• Mastodon:  mastodon.gamedev.place/@kenney
```

### nature-kit

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/nature-kit
- Included model files: 64
- Downloaded UTC: 2026-10-31T21:35:39.597447+00:00
- Actual archive download: https://opengameart.org/sites/default/files/Nature%20Kit%20%282.1%29.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
Nature Kit (2.1)

	Created/distributed by Kenney (www.kenney.nl)
	Creation date: 29-04-2020 01:02

			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	This content is free to use in personal, educational and commercial projects.

	Support us by crediting Kenney or www.kenney.nl (this is not mandatory)

			------------------------------

	Donate:   http://support.kenney.nl
	Request:  http://request.kenney.nl
	Patreon:  http://patreon.com/kenney/

	Follow on Twitter for updates:
	http://twitter.com/KenneyNL
```

### city-kit-roads

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/city-kit-roads
- Included model files: 16
- Downloaded UTC: 2026-10-31T21:35:37.803582+00:00
- Actual archive download: https://opengameart.org/sites/default/files/kenney_city-kit-roads_2.2.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `374a4552115cbd11b4ec5c930ee31a533562dc78a09af249a655d03f7ea3b959`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
City Kit Roads (2.2)

	Created/distributed by Kenney (www.kenney.nl)
	Creation date: 10-10-2026 12:35
	
			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	You can use this content for personal, educational, and commercial purposes.

	Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

			------------------------------

	• Website : www.kenney.nl
	• Donate  : www.kenney.nl/donate

	• Patreon : patreon.com/kenney
	
	Follow on social media for updates:

	• Twitter:	 twitter.com/KenneyNL
	• BlueSky:	 kenney.bsky.social
	• Instagram: instagram.com/kenney_nl
```

### toy-car-kit

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/toy-car-kit
- Included model files: 8
- Downloaded UTC: 2026-10-31T21:36:00.679117+00:00
- Actual archive download: https://opengameart.org/sites/default/files/kenney_toy-car-kit.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `d28ed13baf60b3cb4932e2984aeac9d8cdc3449936597e5da962c61ba2dae469`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
Toy Car Kit (1.0)

	Created/distributed by Kenney (www.kenney.nl)
	Creation date: 24-09-2024 10:32
	
			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	You can use this content for personal, educational, and commercial purposes.

	Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

			------------------------------

	• Website : www.kenney.nl
	• Donate  : www.kenney.nl/donate

	• Patreon : patreon.com/kenney
	
	Follow on social media for updates:

	• Twitter:   twitter.com/KenneyNL
	• Instagram: instagram.com/kenney_nl
	• Mastodon:  mastodon.gamedev.place/@kenney
```

### food-kit

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/food-kit
- Included model files: 6
- Downloaded UTC: 2026-10-31T21:37:20.699226+00:00
- Actual archive download: https://opengameart.org/sites/default/files/kenney_food-kit.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `cdad90853682499b94c9fda2f87678b24bfd8f3264e0ed323f6b6a27fd7c6f6f`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
Food Kit (2.0)

	Created/distributed by Kenney (www.kenney.nl)
	Creation date: 26-06-2024 01:23
	
			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	You can use this content for personal, educational, and commercial purposes.

	Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

			------------------------------

	• Website : www.kenney.nl
	• Donate  : www.kenney.nl/donate

	• Patreon : patreon.com/kenney
	
	Follow on social media for updates:

	• Twitter:   twitter.com/KenneyNL
	• Instagram: instagram.com/kenney_nl
	• Mastodon:  mastodon.gamedev.place/@kenney
```

### factory-kit

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/factory-kit
- Included model files: 10
- Downloaded UTC: 2026-10-31T21:35:57.849211+00:00
- Actual archive download: https://opengameart.org/sites/default/files/kenney_factory-kit_3.0.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `7e31fb2308e90304672bd15cd18fa9d9f02c03731a8cbc57a8e3e1c181dfb0a7`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
Factory Kit (3.0)

	Created/distributed by Kenney (www.kenney.nl)
	Creation date: 01-05-2026 14:45
	
			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	You can use this content for personal, educational, and commercial purposes.

	Support by crediting 'Kenney' or 'www.kenney.nl' (this is not a requirement)

			------------------------------

	• Website : www.kenney.nl
	• Donate  : www.kenney.nl/donate

	• Patreon : patreon.com/kenney
	
	Follow on social media for updates:

	• Twitter:	 twitter.com/KenneyNL
	• BlueSky:	 kenney.bsky.social
	• Instagram: instagram.com/kenney_nl
```

### racing-kit

- Author: Kenney
- Source/licensing page: https://opengameart.org/content/racing-kit
- Included model files: 2
- Downloaded UTC: 2026-10-31T21:35:57.646872+00:00
- Actual archive download: https://opengameart.org/sites/default/files/Racing%20Kit%20%281.2%29.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `103acf8a85a04e94e2d3a9933fbcea12e9422c14d5e364eb013019a882af7f48`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
Racing Kit (1.2)

	Created/distributed by Kenney (www.kenney.nl)

			------------------------------

	License: (Creative Commons Zero, CC0)
	http://creativecommons.org/publicdomain/zero/1.0/

	This content is free to use in personal, educational and commercial projects.

	Support us by crediting (Kenney or www.kenney.nl), this is not mandatory.

			------------------------------

	Donate:   http://support.kenney.nl
	Request:  http://request.kenney.nl
	Patreon:  http://patreon.com/kenney/

	Follow on Twitter for updates:
	@KenneyNL
```

### plewr

- Author: Plewr
- Source/licensing page: https://plewr.itch.io/3d-rigged-character
- Included model files: 1
- Downloaded UTC: 2026-10-31T21:37:28.744004+00:00
- Original download: `characterRIGGED.glb`, itch.io upload ID 11648232, obtained using the anonymous download button endpoint on the source page.
- SHA-256 of downloaded archive (or original GLB for Plewr): `c820471054b1956cd3368b3d344fb2a532cc4ef7da6ab2637bcc8146fba5e5dd`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/
- Source declaration: “License type: CC0 (Free)”; source page also marks no generative AI. No bundled separate license file was supplied with this individual download.

### lowpoly-concert-props

- Author: iPoly3D
- Source/licensing page: https://opengameart.org/content/lowpoly-concert-props
- Included model files: 13
- Downloaded UTC: 2026-10-31T21:37:56.652482+00:00
- Actual archive download: https://opengameart.org/sites/default/files/lowpoly_concert_pack.zip
- SHA-256 of downloaded archive (or original GLB for Plewr): `d62ff561818f52a1075debb5f71a7785200d9c7e8e0f6d2340f770f5113a57cd`
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

Original bundled notice (retained verbatim):

```text
---------------------------------
    _ ____        __     _____ ____ 
   (_) __ \____  / /_  _|__  // __ \
  / / /_/ / __ \/ / / / //_ </ / / /
 / / ____/ /_/ / / /_/ /__/ / /_/ / 
/_/_/    \____/_/\__, /____/_____/  
                /____/              

---------------------------------


If you want to support me, check my patreon: https://www.patreon.com/ipoly3d/


License: CC0 1.0 Universal (CC0 1.0) 
Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/

➖ You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission.

➖ You cannot claim to be the autor or the owner of the assets.

➖ Giving attribution is not required, but is much appreciated!
```

## Excluded candidates and collection limits

Source discovery covered Kenney, Quaternius, OpenGameArt, Poly Pizza, and CC0-tagged itch.io models. Several common Poly Pizza microphone/whiteboard/pulpit entries were CC-BY and were rejected. Quaternius' later general licensing changes were not treated as a blanket CC0 grant; only the specific older creator-uploaded CC0 archive above is included. A CC0 rigged base with male/female anatomy was not used for the neutral-base requirement. Blender-only vent/industrial packs, unsupported source formats without a validated conversion, unreachable downloads, and uncertain licenses are not part of this deliverable. No paid marketplace was scraped and no replacement meshes were invented.
