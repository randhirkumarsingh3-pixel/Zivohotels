output "github_actions_sa_email" {
  description = "The email of the Service Account created for GitHub Actions deployments"
  value       = google_service_account.github_actions_sa.email
}

output "workload_identity_provider_name" {
  description = "The full resource name of the Workload Identity Provider (used in GitHub Actions YAML)"
  value       = google_iam_workload_identity_pool_provider.github_provider.name
}
