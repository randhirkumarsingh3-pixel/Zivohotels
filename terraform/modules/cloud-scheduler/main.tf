resource "google_cloud_scheduler_job" "jobs" {
  for_each = var.jobs

  name             = each.key
  description      = each.value.description
  schedule         = each.value.schedule
  time_zone        = each.value.time_zone
  region           = var.region
  project          = var.project_id

  http_target {
    http_method = each.value.http_method
    uri         = each.value.target_uri
    
    # Authenticate to the target Cloud Run service
    oidc_token {
      service_account_email = var.invoker_sa_email
    }
  }
}
