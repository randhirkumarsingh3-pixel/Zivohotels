# Flatten the combination of environments and secrets into a single map
locals {
  env_secrets = flatten([
    for env in var.environments : [
      for secret in var.secret_names : {
        key  = "${secret}_${upper(env)}"
        name = lower(replace("${secret}-${env}", "_", "-"))
        env  = env
      }
    ]
  ])
}

# Create a Secret Manager Secret for each combination
resource "google_secret_manager_secret" "secrets" {
  for_each = {
    for s in local.env_secrets : s.key => s
  }

  project   = var.project_id
  secret_id = each.value.name

  replication {
    auto {}
  }
}

# Note: We create the definitions here, but the actual values 
# must be populated manually via GCP Console or CLI, 
# or passed in via variables (but we don't store secrets in state if possible).
