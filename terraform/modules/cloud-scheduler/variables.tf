variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "jobs" {
  description = "Map of scheduled jobs"
  type = map(object({
    description = string
    schedule    = string
    time_zone   = string
    target_uri  = string
    http_method = string
  }))
}

variable "invoker_sa_email" {
  description = "Service account email to use for OIDC auth when invoking the target URL"
  type        = string
}
