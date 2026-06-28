# 1. Notification Channel for Alerts
resource "google_monitoring_notification_channel" "email" {
  display_name = "Admin Alert Email"
  type         = "email"
  project      = var.project_id
  labels = {
    email_address = var.alert_email
  }
}

# 2. Domain-Specific Dashboard: API & Compute
resource "google_monitoring_dashboard" "api_dashboard" {
  project = var.project_id
  dashboard_json = <<EOF
{
  "displayName": "ZivoHotels - API & Compute",
  "gridLayout": {
    "widgets": [
      {
        "title": "Cloud Run Request Latency (50th, 95th, 99th)",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "crossSeriesReducer": "REDUCE_PERCENTILE_99",
                  "perSeriesAligner": "ALIGN_DELTA"
                }
              }
            }
          }]
        }
      },
      {
        "title": "Cloud Run 5xx Errors",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" metric.labels.response_code_class=\"5xx\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "crossSeriesReducer": "REDUCE_SUM",
                  "perSeriesAligner": "ALIGN_RATE"
                }
              }
            }
          }]
        }
      }
    ]
  }
}
EOF
}

# 3. Domain-Specific Dashboard: Database & Infrastructure
resource "google_monitoring_dashboard" "db_dashboard" {
  project = var.project_id
  dashboard_json = <<EOF
{
  "displayName": "ZivoHotels - Database & Infrastructure",
  "gridLayout": {
    "widgets": [
      {
        "title": "Cloud SQL CPU Utilization",
        "xyChart": {
          "dataSets": [{
            "timeSeriesQuery": {
              "timeSeriesFilter": {
                "filter": "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" resource.type=\"cloudsql_database\"",
                "aggregation": {
                  "alignmentPeriod": "60s",
                  "crossSeriesReducer": "REDUCE_MEAN",
                  "perSeriesAligner": "ALIGN_MEAN"
                }
              }
            }
          }]
        }
      }
    ]
  }
}
EOF
}

# 4. SLO / Alert Policy: High API Error Rate (SLO < 99.9%)
resource "google_monitoring_alert_policy" "high_5xx_rate" {
  display_name = "High API 5xx Error Rate"
  project      = var.project_id
  combiner     = "OR"
  
  conditions {
    display_name = "Cloud Run 5xx errors > 1% in 5 minutes"
    condition_threshold {
      filter     = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" metric.labels.response_code_class=\"5xx\""
      duration   = "300s"
      comparison = "COMPARISON_GT"
      threshold_value = 0.01 # 1%
      trigger {
        count = 1
      }
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]
  
  documentation {
    content = "Runbook: High API Errors. Check Cloud Run logs for 'CrashLoopBackOff' or Prisma connection failures. Revert latest deployment if needed."
  }
}

# 5. Alert Policy: Database CPU Exhaustion
resource "google_monitoring_alert_policy" "db_high_cpu" {
  display_name = "Database CPU > 80%"
  project      = var.project_id
  combiner     = "OR"
  
  conditions {
    display_name = "Cloud SQL CPU Utilization"
    condition_threshold {
      filter     = "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" resource.type=\"cloudsql_database\""
      duration   = "300s" # 5 mins
      comparison = "COMPARISON_GT"
      threshold_value = 0.8 # 80%
      trigger {
        count = 1
      }
      aggregations {
        alignment_period   = "60s"
        cross_series_reducer = "REDUCE_MEAN"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]
  
  documentation {
    content = "Runbook: Cloud SQL CPU is critically high. Verify if there is a sudden spike in expensive queries, or if the instance needs vertical scaling."
  }
}
