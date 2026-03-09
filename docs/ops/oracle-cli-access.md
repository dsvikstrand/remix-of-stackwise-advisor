# Oracle CLI Access

## Purpose
- This document standardizes Oracle Cloud Infrastructure control-plane access for Bleup operations.
- Use it for instance inspection, reboot, and other OCI-level host management tasks when SSH is unavailable or insufficient.
- This is not the same thing as Oracle Generative AI API keys.

## Auth Model
- Use a normal OCI API signing key attached to the Oracle user that owns or can manage the Bleup tenancy resources.
- The Oracle CLI config uses:
  - `user`
  - `tenancy`
  - `region`
  - `fingerprint`
  - `key_file`

## Machine-Level Locations
- OCI config file: `/root/.oci/config`
- OCI private key: `/root/.oci/oci_api_key.pem`
- CLI binary: `/usr/local/bin/oci`

## Security Rules
- Never commit the private key.
- Never commit live OCI config snippets with real OCIDs or fingerprints.
- Keep local operator notes like `oracle_info.txt` out of the repo.
- Prefer placeholders in docs and real values only in `/root/.oci/config`.

## Standard Config Shape
```ini
[DEFAULT]
user=ocid1.user.oc1..<user_ocid>
fingerprint=aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99
tenancy=ocid1.tenancy.oc1..<tenancy_ocid>
region=ca-toronto-1
key_file=/root/.oci/oci_api_key.pem
```

## Safe Verification
```bash
oci --version
oci iam region-subscription list --tenancy-id <tenancy_ocid>
```

## Common Oracle Control Commands
- Inspect instance list:
```bash
oci compute instance list --compartment-id <tenancy_or_compartment_ocid> --all --output json
```

- Inspect one instance:
```bash
oci compute instance get --instance-id <instance_ocid> --output json
```

- Inspect the primary VNIC and public IP:
```bash
oci compute vnic-attachment list --compartment-id <tenancy_or_compartment_ocid> --instance-id <instance_ocid> --output json
oci network vnic get --vnic-id <vnic_ocid> --output json
```

- Reboot the Bleu Oracle VM:
```bash
oci compute instance action --instance-id <instance_ocid> --action RESET --output json
```

## Bleup Oracle Notes
- Host alias for SSH: `oracle-free`
- Runtime repo path: `/home/ubuntu/remix-of-stackwise-advisor`
- Frontend is hosted separately on GitHub Pages, so it can stay up while Oracle backend access is degraded.

## Operational Rule
- If Oracle SSH and `https://api.bleup.app/api/health` both fail, use OCI control-plane access first to determine whether the VM itself is wedged before assuming an app-code regression.
