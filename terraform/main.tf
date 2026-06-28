terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
  
  # Note: Initially using local backend. For team/CI usage, this should be migrated to a GCS backend.
  # backend "gcs" {
  #   bucket  = "zivohotels-terraform-state"
  #   prefix  = "terraform/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

module "iam" {
  source      = "./modules/iam"
  project_id  = var.project_id
  github_repo = var.github_repo
}

module "secret_manager" {
  source       = "./modules/secret-manager"
  project_id   = var.project_id
  environments = ["dev", "staging", "prod"]
}

module "networking" {
  source     = "./modules/networking"
  project_id = var.project_id
  region     = var.region
}

module "cloud_sql" {
  source                 = "./modules/cloud-sql"
  project_id             = var.project_id
  region                 = var.region
  environments           = ["dev", "staging", "prod"]
  vpc_id                 = module.networking.vpc_id
  private_vpc_connection = module.networking.private_vpc_connection
}

module "cloud_storage" {
  source       = "./modules/cloud-storage"
  project_id   = var.project_id
  region       = var.region
  environments = ["dev", "staging", "prod"]
}

# The main API Service
module "api_service" {
  source          = "./modules/cloud-run"
  project_id      = var.project_id
  region          = var.region
  service_name    = "zivohotels-api-prod"
  image           = "gcr.io/${var.project_id}/api:latest" # Placeholder, updated by CI
  is_public       = false # Accessed via Gateway
  vpc_connector   = module.networking.vpc_connector_name
  min_instances   = 1
  max_instances   = 20
  secret_env_vars = {
    DATABASE_URL = "database-url-prod"
    JWT_SECRET   = "jwt-secret-prod"
  }
}

# Continuous Worker: Email
module "email_worker" {
  source          = "./modules/cloud-run"
  project_id      = var.project_id
  region          = var.region
  service_name    = "zivohotels-worker-email-prod"
  image           = "gcr.io/${var.project_id}/api:latest"
  command         = ["npm", "run", "worker:email"]
  vpc_connector   = module.networking.vpc_connector_name
  min_instances   = 1
  max_instances   = 10
  secret_env_vars = {
    DATABASE_URL      = "database-url-prod"
    RESEND_API_KEY    = "resend-api-key-prod"
    RESEND_FROM_EMAIL = "resend-from-email-prod"
  }
}

# Continuous Worker: Notifications
module "notification_worker" {
  source          = "./modules/cloud-run"
  project_id      = var.project_id
  region          = var.region
  service_name    = "zivohotels-worker-notification-prod"
  image           = "gcr.io/${var.project_id}/api:latest"
  command         = ["npm", "run", "worker:notification"]
  vpc_connector   = module.networking.vpc_connector_name
  min_instances   = 1
  max_instances   = 20
  secret_env_vars = {
    DATABASE_URL = "database-url-prod"
  }
}

# API Gateway (Public facing)
module "api_gateway" {
  source         = "./modules/api-gateway"
  project_id     = var.project_id
  region         = var.region
  openapi_config = "openapi-spec-content-placeholder" # In reality, loaded from a file
}

# Scheduled Workers (Jobs)
module "cloud_scheduler" {
  source           = "./modules/cloud-scheduler"
  project_id       = var.project_id
  region           = var.region
  invoker_sa_email = module.iam.github_actions_sa_email # In prod, use a dedicated invoker SA

  jobs = {
    "cleanup-worker" = {
      description = "Runs the database cleanup worker every midnight"
      schedule    = "0 0 * * *"
      time_zone   = "Asia/Kolkata"
      target_uri  = "https://zivohotels-worker-cleanup-prod-hash.run.app/execute" # Target Cloud Run service URL
      http_method = "POST"
    },
    "pricing-worker" = {
      description = "Runs dynamic pricing updates every hour"
      schedule    = "0 * * * *"
      time_zone   = "Asia/Kolkata"
      target_uri  = "https://zivohotels-worker-pricing-prod-hash.run.app/execute"
      http_method = "POST"
    },
    "analytics-worker" = {
      description = "Aggregates analytics data nightly"
      schedule    = "30 1 * * *"
      time_zone   = "Asia/Kolkata"
      target_uri  = "https://zivohotels-worker-analytics-prod-hash.run.app/execute"
      http_method = "POST"
    }
  }
}

# Monitoring (Dashboards, SLOs, Alerting)
module "monitoring" {
  source      = "./modules/monitoring"
  project_id  = var.project_id
  alert_email = "admin@zivohotels.com"
}

