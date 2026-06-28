resource "google_storage_bucket" "media_buckets" {
  for_each = toset(var.environments)

  name          = "zivohotels-media-${each.value}"
  location      = var.region
  project       = var.project_id
  
  # Protect production buckets from accidental deletion
  force_destroy = each.value == "prod" ? false : true

  # Ensure uniform bucket-level access (prevents mixing IAM and ACLs)
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  cors {
    origin          = ["https://zivohotels.com", "https://app.zivohotels.com", "http://localhost:5173", "http://localhost:3000"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  # Lifecycle policies
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      # Delete noncurrent versions after 30 days
      num_newer_versions = 3
      days_since_noncurrent_time = 30
    }
  }

  # Move old logs/reports to Coldline after 90 days
  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
    condition {
      age = 90
      matches_prefix = ["reports/", "logs/"]
    }
  }
}

# Make the buckets public for media delivery (for non-private assets)
resource "google_storage_bucket_iam_member" "public_read" {
  for_each = toset(var.environments)

  bucket = google_storage_bucket.media_buckets[each.value].name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
