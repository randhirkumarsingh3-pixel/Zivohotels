variable "project_id" {
  type = string
}

variable "alert_email" {
  description = "Email address to send critical infrastructure and application alerts"
  type        = string
  default     = "admin@zivohotels.com"
}
