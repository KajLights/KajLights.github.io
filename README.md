# KajLights website

The main website owns public guidance, the release catalogue and the device/installer
workspace. LightVM and kaj-fi own their implementations and release artifacts.
This Astro site is the catalogue/maintenance stage; moving the complete lighting
editor and lessons here is a separate stage.

## Local development

Use Node 24, Python 3.12+ and GitHub CLI (`gh`). Public release acquisition needs a
GitHub token for API access and attestation verification. Visitors need no account
or GitHub credentials.

```sh
python3 -m venv build/venv
build/venv/bin/python -m pip install -r requirements.txt
build/venv/bin/python scripts/prepare-source.py
npm ci
build/venv/bin/python scripts/import-releases.py
npm run dev
```

`implementation.json` pins public LightVM source by full commit SHA. The website
imports its shared client, transports, schemas and payload/candidate checks.
Production preparation/import refuse a local symlink or modified source.
`prepare-source.py --local /absolute/checkout` is a development-only override.

`npm run build` checks types and creates `dist/`; `npm run preview` serves it.
`BASE_PATH=/preview/ npm run build` supports non-root static deployment. Internal
links and asset requests respect the base; workspace routes use hashes. Firmware
toolchains are not needed to assemble the site.

## Catalogue and device behaviour

Read [release operations](release-policy/README.md) before enabling installation.
Device-core discovery verifies published-release tag/source identity, trusted
GitHub provenance and every payload before handing files to the website mirror.
The importer creates immutable hash-addressed paths, an exact import lock and a
schema-validated catalogue. It replaces the previous catalogue only after all
sources succeed. Generated distribution files are excluded from source Git.

Website policy owns recommendations, withdrawals, supported tool contracts and
per-build/per-method physical acceptance. Initially there are no installation
approvals and no published releases. Tests use synthetic fixtures via test imports
or browser interception, never production candidates. Private kaj-fi distribution
is disabled and cannot be enabled merely by changing its policy flag.

One live session is bound to hardware and boot IDs. Nickname saves also require
the current metadata revision. Names never route commands. Minimal remembered
inventory stays in local storage without network addresses; pending installation
confirmation uses per-tab session storage. Remembered devices are not contacted
automatically. Switching workspace views preserves the connection and name draft.

The lazy-loaded, pinned esptool-js adapter measures chip, flash size, chip revision,
security state and MAC. All payload hashes pass before review, physical identity
is checked again immediately before writing, and SDK readback digests verify the
written bytes. Unsupported secured/encrypted devices are rejected. Pico uses an
explicitly model-selected UF2 download, without claiming drive copy or direct
PICOBOOT writing. Both routes require reconnecting to read the matching running
build before confirmation. Device/boot/selection/feature/catalogue changes expire
prepared reviews. A failed catalogue refresh disables preparation.

Current contracts require clean installation. Settings exports include nickname,
active LightVM configuration and non-secret network settings, but are not complete
program/source backups. Automatic restore and OTA are not implemented.

## Validation

```sh
npm test
build/venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
npm run format:check
npm run build
build/venv/bin/python .deps/lightvm/tools/fetch_audio_core.py
cmake -S .deps/lightvm -B build/test-device -DLIGHTVM_PLATFORM=host -DLIGHTVM_HTTP=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build/test-device --target lightvm --parallel 2
npx playwright install chromium
LIGHTVM_PYTHON="$PWD/build/venv/bin/python" npm run test:browser
```

Browser tests use an isolated native LightVM simulator for nickname persistence,
stale-revision rejection and settings export, plus test-only catalogue fixtures
for installer behaviour. SDK tests inject a fake ROM transport. No test flashes a
physical board. `CHROME_EXECUTABLE` selects an installed Chromium;
`LIGHTVM_RECEIVER` selects the native test binary. Physical board acceptance is
required before policy enables a build/method. The simulator is never distributed
as installable firmware.

## Publishing and reconciliation

The website workflow runs on PRs/main pushes, daily, manually and for the optional
`firmware-release-published` repository dispatch. Dispatch payloads never select
trusted sources: policy and published releases are re-read. Scheduled refresh
detects changed, missing or newly published releases without cross-repository
write credentials. Import/test/build failures prevent deployment.

The existing live site still uses `main:/docs`. Its Jekyll source remains in
`docs/` until the explicit cutover and is not Astro input. This PR does not change
live Pages settings. For the agreed launch:

1. Set repository Settings → Pages → Source to **GitHub Actions**.
2. Set the repository Actions variable **PUBLISH_WEBSITE=true**.
3. Run the website workflow on main and verify `https://kajlights.com/`, the
   catalogue and `/studio/#/devices`. The CNAME remains `kajlights.com`.
4. Remove retired Jekyll source after verifying the new deployment. Retain the
   previous deployment/artifact for operational rollback.

After cutover, successful main and reconciliation builds deploy a complete Pages
snapshot. PRs never deploy. CI saves the built site, import lock, pin and policy as
a 14-day review artifact. To reproduce an acquisition, restore its policy and
implementation pin, then run:

```sh
build/venv/bin/python scripts/import-releases.py --locked /path/to/import-lock.json
```

Locked imports re-verify the exact release inventory and manifest hashes, reject
changed/missing locked releases and ignore later releases. Website workflows never
create firmware tags or publish firmware releases.
