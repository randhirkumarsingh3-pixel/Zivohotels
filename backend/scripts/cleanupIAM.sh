#!/bin/bash
# ZivoHotels Migration Sprint 5B Cleanup Script

SA_EMAIL="media-migrator@zivohotels-500807.iam.gserviceaccount.com"

echo "--- Starting ZivoHotels Credential Cleanup ---"

# 1. Delete all keys associated with the temporary service account
echo "Fetching active keys for $SA_EMAIL..."
KEYS=$(gcloud iam service-accounts keys list --iam-account=$SA_EMAIL --format="value(name)")

if [ -z "$KEYS" ]; then
    echo "No keys found to delete."
else
    for key in $KEYS; do
        if [[ $key != *"keyid/SYSTEM_MANAGED"* ]]; then
            echo "Deleting key $key..."
            gcloud iam service-accounts keys delete $key --iam-account=$SA_EMAIL --quiet
        fi
    done
fi

# 2. Delete the temporary service account itself
echo "Deleting temporary service account $SA_EMAIL..."
gcloud iam service-accounts delete $SA_EMAIL --quiet

# 3. Verify cleanup
echo "Verifying cleanup..."
VERIFY=$(gcloud iam service-accounts list --filter="email:$SA_EMAIL" --format="value(email)")
if [ -z "$VERIFY" ]; then
    echo "✅ SUCCESS: Temporary service account completely removed."
else
    echo "❌ ERROR: Service account still exists!"
fi

echo "--- Cleanup Complete ---"
