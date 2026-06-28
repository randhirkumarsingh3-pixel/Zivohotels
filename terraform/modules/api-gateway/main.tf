resource "google_api_gateway_api" "api" {
  provider     = google-beta
  project      = var.project_id
  api_id       = var.api_id
  display_name = "ZivoHotels Gateway API"
}

resource "google_api_gateway_api_config" "api_config" {
  provider     = google-beta
  project      = var.project_id
  api          = google_api_gateway_api.api.api_id
  api_config_id_prefix = "config-"

  openapi_documents {
    document {
      path     = "spec.yaml"
      contents = var.openapi_config
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_api_gateway_gateway" "gateway" {
  provider   = google-beta
  project    = var.project_id
  region     = var.region
  api_config = google_api_gateway_api_config.api_config.id
  gateway_id = var.gateway_id
}
