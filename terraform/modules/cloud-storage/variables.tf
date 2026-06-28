variable "project_id" {
  description = "The ID of the GCP Project"
  type        = string
}

variable "region" {
  description = "The default GCP region for resources"
  type        = string
}

variable "environments" {
  description = "List of environments to create buckets for"
  type        = list(string)
  default     = ["dev", "staging", "prod"]
}
