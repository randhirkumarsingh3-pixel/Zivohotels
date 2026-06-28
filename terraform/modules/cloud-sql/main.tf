# Define instance sizing based on environment (Prod is larger, Dev/Staging smaller)
locals {
  tier_map = {
    dev     = "db-f1-micro"
    staging = "db-f1-micro"
    prod    = "db-custom-2-8192" # 2 vCPU, 8GB RAM (adjust based on pre-migration metrics)
  }
}

resource "google_sql_database_instance" "instances" {
  for_each = toset(var.environments)

  name             = "zivohotels-pg-${each.value}"
  database_version = "POSTGRES_16"
  region           = var.region
  project          = var.project_id
  
  # Ensure the private VPC connection exists before creating the instance
  depends_on = [var.private_vpc_connection]

  settings {
    tier = local.tier_map[each.value]

    # Private IP only (no public IP)
    ip_configuration {
      ipv4_enabled    = false
      private_network = var.vpc_id
    }

    # High Availability for Prod only
    availability_type = each.value == "prod" ? "REGIONAL" : "ZONAL"

    backup_configuration {
      enabled                        = true
      start_time                     = "02:00" # 2 AM UTC
      point_in_time_recovery_enabled = each.value == "prod" ? true : false
      # Retain 7 days of backups
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }
  }

  deletion_protection = each.value == "prod" ? true : false
}

# Create the application database inside the instance
resource "google_sql_database" "databases" {
  for_each = toset(var.environments)

  name     = "zivohotels_${each.value}"
  instance = google_sql_database_instance.instances[each.value].name
  project  = var.project_id
}

# Generate a random password for the default user
resource "random_password" "db_passwords" {
  for_each = toset(var.environments)
  
  length           = 16
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Create a default user
resource "google_sql_user" "users" {
  for_each = toset(var.environments)

  name     = "zivo_admin"
  instance = google_sql_database_instance.instances[each.value].name
  project  = var.project_id
  password = random_password.db_passwords[each.value].result
}
