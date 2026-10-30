# Release catalogue operations

`policy.json` is website-owned policy. Firmware manifests describe what was built;
website policy describes what is offered and accepted. The LightVM application
baseline stays 0.1.0. Routine features do not bump versions.

The importer pages through registered release history, excludes draft/development
releases and includes published prereleases for explicit UI opt-in. It verifies
tag commit, source/product ownership, release/channel identity, official release
workflow provenance and all asset sizes/digests. Device-provided URLs and dispatch
payloads do not select firmware. An invalid published release fails the complete
acquisition: fix or remove it instead of silently skipping it. The previous
deployment stays available until a successful complete replacement.

Candidates use full build digests. Equal application versions can have different
boards/profiles/features. The UI sorts semantic versions and places standard first
within a version. Withdrawn builds are inspectable but never ordinary install
choices. Saved-content capacity, application size and VM memory are separate;
excluding a feature does not imply every freed byte becomes animation storage.

## Enabling a build

After an explicitly authorised product tag/release publication:

1. Import and inspect catalogue, mirrored hashes, capacities, notices and import
   lock in the CI artifact. Publication alone never enables installation.
2. Validate the product tools. Add its exact `artifact.tools.contract` to
   `tool_contracts` only when the compiler/configuration/client pairing is
   available and its admission is demonstrated. Historical tool retention is an
   explicit website decision.
3. Exercise clean local installation on the exact board/profile. For ESP include
   measured geometry/revision/security, wrong-device rejection, readback,
   interrupted-write recovery and matching running description. For UF2 include
   family/bounds, model/drive instructions, erased state and running description
   after copying. Existing devices must retain hardware identity and report a new
   boot. Test deliberate downgrades and each offered optional-feature removal.
4. Add method-specific acceptance with durable evidence and the full build digest:

```json
{
  "build_id": "sha256:<64 lowercase hex characters>",
  "methods": ["usb-serial"],
  "evidence": "https://github.com/KajLights/lightvm/issues/<acceptance-record>"
}
```

5. Optionally add `{"build_id":"sha256:<digest>"}` to `recommendations`.
   Recommendation never bypasses checks. Run the website checks and review policy
   before publishing it.

Initial `tool_contracts` and `installation_acceptances` are empty. Simulator and
mocked ROM tests do not constitute physical acceptance. Direct PICOBOOT writing
needs an independently measured flash geometry route; it remains unavailable.
OTA is outside current installation contracts.

## Withdrawal, history and private distribution

Add `{"build_id":"sha256:<digest>","reason":"<human explanation>"}` to
`withdrawals` and reconcile the site. Withdrawal overrides recommendation while
preserving history. A downloaded UF2 cannot be revoked; current catalogue policy
is checked before each new download/write.

The mirror retains verified published history at hash-addressed paths, bounded by
a 768 MiB budget. Exceeding it fails the build. Investigate sizes and explicitly
choose retention or hosting policy; do not silently drop downgrades or bypass
verification with external URLs. Temporary staging deduplicates identical paths;
the import lock records releases, manifests, policy hash and implementation pin.

kaj-fi is registered but disabled. Enabling a private source is rejected even if
`enabled` becomes true. It needs an agreed public distribution route and importer
changes. CI access does not authorise exposing private assets or credentials.
