# We use google_cloud_run_v2_service which is the newer, better Cloud Run API
resource "google_cloud_run_v2_service" "default" {
  name     = var.service_name
  location = var.region
  project  = var.project_id
  
  template {
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }
    
    timeout = "${var.timeout_seconds}s"
    
    # Configure VPC access if needed (for Cloud SQL)
    dynamic "vpc_access" {
      for_each = var.vpc_connector != null ? [var.vpc_connector] : []
      content {
        connector = vpc_access.value
        egress    = "ALL_TRAFFIC" # Route all traffic through VPC if needed, or just private
      }
    }
    
    containers {
      image = var.image
      
      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }
      
      # Optional command override (e.g. ["npm", "run", "worker:email"])
      dynamic "command" {
        for_each = length(var.command) > 0 ? [var.command] : []
        content {
          command = command.value
        }
      }
      
      # Standard environment variables
      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
      
      # Secret Manager environment variables
      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      # Health check probes (Liveness)
      liveness_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 10
        period_seconds        = 15
        failure_threshold     = 3
      }

      # Readiness probe
      startup_probe {
        http_get {
          path = "/ready"
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 5
      }
    }
  }

  # Make it deployed but avoid failing if the image isn't built yet during initial apply
  # We might need to use a placeholder image initially or rely on CI/CD
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

# Allow unauthenticated access if it's a public API
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  count    = var.is_public ? 1 : 0
  project  = google_cloud_run_v2_service.default.project
  location = google_cloud_run_v2_service.default.location
  name     = google_cloud_run_v2_service.default.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
